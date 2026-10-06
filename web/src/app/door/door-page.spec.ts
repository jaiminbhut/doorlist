import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { anEvent } from '../testing/fixtures';
import { ScanResult } from './checkin-api';
import { DoorPage } from './door-page';
import { DoorStore } from './door-store';

// A code for event 42, signed by the API's C# TicketSigner (see ticket-code.spec.ts).
const publicKey =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEfsOv8+iHENG+a1Nu/U9/CtnPJ6BGkgpUz8TEqyLzk67X4X2w/zIp+Pe2MywzXl01Os5NnPVcqWWxYEBAZZC++A==';
const ticketId = '0192c3d4-5e6f-7a8b-9cde-f0123456789a';
const code =
  'DL1.AZLD1F5veouc3vASNFZ4mgAAACo.-lBYqKfc_FbqldlkYr04CoMNewSFcky0UFoOnQRn58gOBKIzJPNkcRlcUirkqT9XwcNbhGBDLIzOZyHYkx35Lw';
const forged = code.replace('AZLD1F5veouc3vASNFZ4mgAAACo', 'AZLD1F5veouc3vASNFZ4mwAAACo');

describe('DoorPage', () => {
  let fixture: ComponentFixture<DoorPage>;
  let http: HttpTestingController;
  const page = () => fixture.nativeElement as HTMLElement;
  const verdict = () => page().querySelector('.verdict')?.textContent ?? '';
  const waiting = () => page().querySelector('.waiting')?.textContent?.trim();

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const offline = (request: TestRequest) =>
    request.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

  const result = (
    outcome: ScanResult['outcome'],
    overrides: Partial<ScanResult> = {},
  ): ScanResult => ({
    scanId: 'ignored',
    outcome,
    ticketId,
    holderName: 'Asha',
    ticketTypeName: 'General admission',
    admittedAt: '2026-11-20T18:01:00Z',
    admittedAtDoor: 'North door',
    ...overrides,
  });

  /** Opens the door page for an event, with the server reachable or not for the start-up requests. */
  const open = async (eventId = 42, { online = true } = {}) => {
    TestBed.configureTestingModule({
      imports: [DoorPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(DoorStore).setDoorName('South door');
    fixture = TestBed.createComponent(DoorPage);
    fixture.componentRef.setInput('id', String(eventId));
    http = TestBed.inject(HttpTestingController);
    await settle();

    const startUp = [
      [http.expectOne(`/api/events/${eventId}`), anEvent({ id: eventId })],
      [http.expectOne('/api/tickets/signing-key'), { algorithm: 'ES256', keyId: 'k1', publicKey }],
      [
        http.expectOne(`/api/events/${eventId}/checkins/summary`),
        { issued: 10, admitted: 3, duplicates: 0, invalid: 0, wrongEvent: 0 },
      ],
    ] as const;
    for (const [request, body] of startUp) {
      if (online) {
        request.flush(body);
      } else {
        offline(request);
      }
    }
    await vi.waitFor(async () => {
      await settle();
      expect(page().textContent).not.toContain('No ticket key yet');
    });
  };

  const scan = async (text: string) => {
    const input = page().querySelector<HTMLInputElement>('#ticket-code')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
    page().querySelector<HTMLButtonElement>('.scan-form button')!.click();
    await settle();
  };

  it('keeps the code field focused for the next scan', async () => {
    await open();
    expect(document.activeElement?.id).toBe('ticket-code');

    await scan(code);
    offline(http.expectOne({ method: 'POST', url: '/api/events/42/checkins' }));
    await vi.waitFor(async () => {
      await settle();
      expect(verdict()).toContain('Admit (offline)');
    });

    expect(document.activeElement?.id).toBe('ticket-code');
  });

  beforeEach(() => localStorage.clear());
  afterEach(() => http.verify());

  it("online, shows the server's answer for the scan", async () => {
    await open();

    await scan(code);
    const request = http.expectOne({ method: 'POST', url: '/api/events/42/checkins' });
    expect(request.request.body).toMatchObject({ deviceLabel: 'South door', scans: [{ code }] });
    expect(request.request.body.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    request.flush({
      results: [result('admitted', { scanId: request.request.body.scans[0].scanId })],
    });
    await vi.waitFor(async () => {
      await settle();
      expect(verdict()).toContain('Admit');
    });
    http
      .expectOne('/api/events/42/checkins/summary')
      .flush({ issued: 10, admitted: 4, duplicates: 0, invalid: 0, wrongEvent: 0 });

    expect(verdict()).toContain('Asha · General admission');
  });

  it('online, refuses a ticket already used and says where and when', async () => {
    await open();

    await scan(code);
    http
      .expectOne({ method: 'POST', url: '/api/events/42/checkins' })
      .flush({ results: [result('alreadyAdmitted')] });
    await vi.waitFor(async () => {
      await settle();
      expect(verdict()).toContain("Already used: don't admit");
    });
    http
      .expectOne('/api/events/42/checkins/summary')
      .flush({ issued: 10, admitted: 3, duplicates: 1, invalid: 0, wrongEvent: 0 });

    expect(verdict()).toContain('admitted at North door');
  });

  it('offline, admits a genuine ticket once, queues it, and refuses it again at this door', async () => {
    await open();

    await scan(code);
    offline(http.expectOne({ method: 'POST', url: '/api/events/42/checkins' }));
    await vi.waitFor(async () => {
      await settle();
      expect(verdict()).toContain('Admit (offline)');
    });
    expect(waiting()).toBe('1 waiting to sync');

    await scan(code);
    offline(http.expectOne({ method: 'POST', url: '/api/events/42/checkins' }));
    await vi.waitFor(async () => {
      await settle();
      expect(verdict()).toContain("Already used at this door: don't admit");
    });
    expect(waiting()).toBe('1 waiting to sync');
  });

  it('offline, rejects forged codes and tickets for other events without queueing them', async () => {
    await open(7);

    await scan(forged);
    offline(http.expectOne({ method: 'POST', url: '/api/events/7/checkins' }));
    await vi.waitFor(async () => {
      await settle();
      expect(verdict()).toContain('Not a valid ticket');
    });

    await scan(code);
    offline(http.expectOne({ method: 'POST', url: '/api/events/7/checkins' }));
    await vi.waitFor(async () => {
      await settle();
      expect(verdict()).toContain('Wrong event');
    });
    expect(waiting()).toBe('0 waiting to sync');
  });

  it('syncs queued scans when asked, and flags any another door admitted first', async () => {
    await open();
    await scan(code);
    offline(http.expectOne({ method: 'POST', url: '/api/events/42/checkins' }));
    await vi.waitFor(async () => {
      await settle();
      expect(waiting()).toBe('1 waiting to sync');
    });

    page().querySelector<HTMLButtonElement>('button.sync')!.click();
    await settle();
    const batch = http.expectOne({ method: 'POST', url: '/api/events/42/checkins' });
    expect(batch.request.body.scans).toHaveLength(1);
    batch.flush({
      results: [result('alreadyAdmitted', { scanId: batch.request.body.scans[0].scanId })],
    });
    await vi.waitFor(async () => {
      await settle();
      expect(waiting()).toBe('0 waiting to sync');
    });
    http
      .expectOne('/api/events/42/checkins/summary')
      .flush({ issued: 10, admitted: 4, duplicates: 1, invalid: 0, wrongEvent: 0 });
    await settle();

    expect(page().querySelector('.flagged')?.textContent).toContain('first admitted at North door');
  });

  it("explains it can't check tickets offline before it has loaded the key once", async () => {
    TestBed.configureTestingModule({
      imports: [DoorPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(DoorPage);
    fixture.componentRef.setInput('id', '42');
    http = TestBed.inject(HttpTestingController);
    await settle();
    offline(http.expectOne('/api/events/42'));
    offline(http.expectOne('/api/tickets/signing-key'));
    offline(http.expectOne('/api/events/42/checkins/summary'));
    await settle();

    await scan(code);
    offline(http.expectOne({ method: 'POST', url: '/api/events/42/checkins' }));
    await vi.waitFor(async () => {
      await settle();
      expect(verdict()).toContain("hasn't loaded the ticket key yet");
    });
    expect(waiting()).toBe('0 waiting to sync');
  });
});
