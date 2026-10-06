import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DoorlistEvent, EventsApi } from '../events/events-api';
import {
  CheckInApi,
  CheckInOutcome,
  CheckInSummary,
  MAX_SCANS_PER_BATCH,
  ScanResult,
} from './checkin-api';
import { DoorStore, QueuedScan } from './door-store';
import { importSigningKey, verifyTicketCode } from './ticket-code';

/** What the door shows for the last scan. "offline" outcomes are this device's own verdict, waiting to sync. */
export type Verdict =
  | { kind: 'server'; result: ScanResult }
  | { kind: 'offline'; outcome: 'admitted' | 'alreadyAdmittedHere' | 'wrongEvent' | 'invalid' }
  | { kind: 'error'; message: string };

const SYNC_EVERY_MS = 20_000;

/**
 * Checks tickets at the door (ADR 8). Online, every scan goes to the server
 * and the server's answer is final. When the server can't be reached, the
 * device decides alone: it checks the code's signature with the cached
 * public key (ADR 7), refuses tickets it has already let in itself, admits
 * the rest, and queues those scans. Queued scans sync when the connection
 * returns, and any the server says another door admitted first are flagged.
 */
@Component({
  selector: 'app-door-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './door-page.html',
  styleUrl: './door-page.css',
})
export class DoorPage implements OnInit {
  private readonly events = inject(EventsApi);
  private readonly api = inject(CheckInApi);
  private readonly store = inject(DoorStore);
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();

  protected readonly event = signal<DoorlistEvent | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly verdict = signal<Verdict | null>(null);
  protected readonly checking = signal(false);
  protected readonly pending = signal(0);
  protected readonly syncing = signal(false);
  protected readonly flagged = signal<ScanResult[]>([]);
  protected readonly summary = signal<CheckInSummary | null>(null);
  protected readonly hasKey = signal(false);
  protected readonly doorName = this.store.doorName();

  // A FormGroup, not a lone control: only [formGroup] gives the form ngSubmit
  // and stops the browser's own submit, which would reload the page.
  protected readonly form = new FormGroup({ code: new FormControl('', { nonNullable: true }) });
  protected readonly tone = computed(() => toneOf(this.verdict()));

  private key: CryptoKey | null = null;

  /**
   * The code field keeps focus: a hardware QR scanner types into whatever has
   * it, so after each scan the next one must land here, not on the button.
   */
  private readonly codeInput = viewChild.required<ElementRef<HTMLInputElement>>('codeInput');

  constructor() {
    afterNextRender(() => this.focusCode());
  }

  private get eventId(): number {
    return Number(this.id());
  }

  ngOnInit(): void {
    this.events.get(this.eventId).subscribe({
      next: (event) => this.event.set(event),
      error: (error: HttpErrorResponse) =>
        this.loadError.set(
          error.status === 404
            ? 'This event does not exist.'
            : 'Could not load this event. Scanning still works.',
        ),
    });
    this.pending.set(this.store.queue(this.eventId).length);
    void this.loadKey();
    this.refreshSummary();

    const syncWhenBack = () => void this.sync();
    window.addEventListener('online', syncWhenBack);
    const timer = setInterval(() => this.pending() > 0 && void this.sync(), SYNC_EVERY_MS);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', syncWhenBack);
      clearInterval(timer);
    });
  }

  protected async check(): Promise<void> {
    const code = this.form.controls.code.value.trim();
    if (!code || this.checking()) {
      return;
    }

    this.checking.set(true);
    this.form.reset();
    const scan: QueuedScan = {
      scanId: crypto.randomUUID(),
      code,
      scannedAt: new Date().toISOString(),
    };

    try {
      const [result] = await firstValueFrom(
        this.api.send(this.eventId, this.store.deviceId(), this.doorName, [scan]),
      );
      if (result.outcome === 'admitted' && result.ticketId) {
        this.store.markAdmitted(this.eventId, result.ticketId);
      }
      this.verdict.set({ kind: 'server', result });
      this.refreshSummary();
    } catch (error) {
      this.verdict.set(
        isOffline(error)
          ? await this.decideOffline(scan)
          : { kind: 'error', message: messageFor(error) },
      );
    } finally {
      this.checking.set(false);
      this.focusCode();
    }
  }

  private focusCode(): void {
    this.codeInput().nativeElement.focus();
  }

  /** Sends queued scans, oldest first, and flags any another door admitted first. */
  protected async sync(): Promise<void> {
    const batch = this.store.queue(this.eventId).slice(0, MAX_SCANS_PER_BATCH);
    if (batch.length === 0 || this.syncing()) {
      return;
    }

    this.syncing.set(true);
    try {
      const results = await firstValueFrom(
        this.api.send(this.eventId, this.store.deviceId(), this.doorName, batch),
      );
      this.store.removeFromQueue(
        this.eventId,
        results.map((result) => result.scanId),
      );
      this.flagged.update((flagged) => [
        ...results.filter((result) => result.outcome === 'alreadyAdmitted'),
        ...flagged,
      ]);
      this.refreshSummary();
    } catch {
      // Still offline: the scans stay queued for the next try.
    } finally {
      this.pending.set(this.store.queue(this.eventId).length);
      this.syncing.set(false);
    }
  }

  private async decideOffline(scan: QueuedScan): Promise<Verdict> {
    if (!this.key) {
      return {
        kind: 'error',
        message:
          "Offline, and this device hasn't loaded the ticket key yet. Connect once, then it works offline.",
      };
    }

    const ticket = await verifyTicketCode(scan.code, this.key);
    if (!ticket) {
      return { kind: 'offline', outcome: 'invalid' };
    }
    if (ticket.eventId !== this.eventId) {
      return { kind: 'offline', outcome: 'wrongEvent' };
    }
    if (this.store.hasAdmitted(this.eventId, ticket.ticketId)) {
      return { kind: 'offline', outcome: 'alreadyAdmittedHere' };
    }

    this.store.markAdmitted(this.eventId, ticket.ticketId);
    this.store.enqueue(this.eventId, scan);
    this.pending.set(this.store.queue(this.eventId).length);
    return { kind: 'offline', outcome: 'admitted' };
  }

  /** Fetches the public key when online, and keeps the last one for offline use. */
  private async loadKey(): Promise<void> {
    try {
      const key = await firstValueFrom(this.api.signingKey());
      this.store.setSigningKey({ keyId: key.keyId, publicKey: key.publicKey });
    } catch {
      // Offline: use the copy from last time, if there is one.
    }

    const cached = this.store.signingKey();
    if (cached) {
      this.key = await importSigningKey(cached.publicKey);
      this.hasKey.set(true);
    }
  }

  private refreshSummary(): void {
    this.api
      .summary(this.eventId)
      .subscribe({ next: (summary) => this.summary.set(summary), error: () => undefined });
  }
}

/** No response at all (status 0): the server couldn't be reached. */
function isOffline(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 0;
}

function messageFor(error: unknown): string {
  if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
    return 'This account can no longer check tickets. Sign in again.';
  }
  return 'The server refused this scan. Try again.';
}

export function toneOf(verdict: Verdict | null): 'good' | 'bad' | 'warn' | null {
  if (!verdict) {
    return null;
  }
  if (verdict.kind === 'error') {
    return 'warn';
  }
  const outcome: CheckInOutcome | 'alreadyAdmittedHere' =
    verdict.kind === 'server' ? verdict.result.outcome : verdict.outcome;
  if (outcome === 'admitted') {
    return verdict.kind === 'offline' ? 'warn' : 'good';
  }
  return 'bad';
}
