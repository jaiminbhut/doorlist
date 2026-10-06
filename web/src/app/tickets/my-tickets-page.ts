import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Ticket, TicketsApi } from './tickets-api';

interface TicketView extends Ticket {
  /** An SVG data URL (allowed by the CSP's img-src data:), or null until drawn. */
  qr: string | null;
  /** True if drawing the QR failed: the code is shown as text instead. */
  qrFailed: boolean;
}

@Component({
  selector: 'app-my-tickets-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './my-tickets-page.html',
  styleUrl: './my-tickets-page.css',
})
export class MyTicketsPage implements OnInit {
  private readonly api = inject(TicketsApi);

  /**
   * Tickets claimed on the way here (navigation state from the event page).
   * Read once: a reload or a later visit shows nothing as new.
   */
  protected readonly claimed: ReadonlySet<string> = new Set(
    (inject(Router).currentNavigation()?.extras.state?.['claimed'] as string[] | undefined) ?? [],
  );

  protected readonly tickets = signal<TicketView[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  /** "2 tickets added for Friday Night Jazz.", after a claim. */
  protected readonly added = computed(() => {
    const added = this.tickets().filter((ticket) => this.claimed.has(ticket.id));
    if (added.length === 0) {
      return null;
    }
    const count = added.length === 1 ? '1 ticket' : `${added.length} tickets`;
    return `${count} added for ${added[0].eventName}.`;
  });

  /** Staggers the new tickets' entrance, in list order. */
  protected arrivalDelay(ticket: TicketView): number {
    const newOnes = this.tickets().filter((view) => this.claimed.has(view.id));
    return newOnes.indexOf(ticket) * 90;
  }

  ngOnInit(): void {
    this.api.mine().subscribe({
      next: (tickets) => {
        // Show the tickets at once; QR codes follow as they're drawn, and a
        // failure there must never leave the page stuck on "Loading".
        this.tickets.set(tickets.map((ticket) => ({ ...ticket, qr: null, qrFailed: false })));
        this.loading.set(false);
        for (const ticket of tickets) {
          void this.drawQr(ticket);
        }
      },
      error: () => {
        this.loadError.set('Could not load your tickets.');
        this.loading.set(false);
      },
    });
  }

  private async drawQr(ticket: Ticket): Promise<void> {
    let update: Partial<TicketView>;
    try {
      update = { qr: await toQr(ticket.code) };
    } catch {
      update = { qrFailed: true };
    }
    this.tickets.update((views) =>
      views.map((view) => (view.id === ticket.id ? { ...view, ...update } : view)),
    );
  }
}

/** The QR library is loaded only when someone opens their tickets, not with every page. */
async function toQr(code: string): Promise<string> {
  const module = await import('qrcode');
  // qrcode is CommonJS. The production build exposes it only as the default
  // export; Node (and so the unit tests) also exposes its named exports.
  // Destructuring a named export broke the production build, so accept both.
  const qrcode = module.default ?? module;
  const svg = await qrcode.toString(code, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
