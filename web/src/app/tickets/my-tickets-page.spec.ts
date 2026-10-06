import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyTicketsPage } from './my-tickets-page';

// Mock qrcode the way the production build exposes this CommonJS package:
// a default export only, with no named exports. Under Node the real package
// also has named exports, which hid a bug that left the page stuck loading.
const toString = vi.hoisted(() => vi.fn<(code: string, options: unknown) => Promise<string>>());
vi.mock('qrcode', () => ({ default: { toString } }));

describe('MyTicketsPage', () => {
  let fixture: ComponentFixture<MyTicketsPage>;
  let http: HttpTestingController;
  const page = () => fixture.nativeElement as HTMLElement;

  const ticket = {
    id: '0192c3d4-0000-7000-8000-000000000001',
    eventId: 1,
    eventName: 'Tech Talks Night',
    venue: 'Main Hall',
    startsAt: '2026-11-20T18:00:00Z',
    ticketTypeName: 'General admission',
    issuedAt: '2026-10-06T09:00:00Z',
    code: 'DL1.AZLD1AAAcACAAAAAAAAAAQAAAAE.signature',
  };

  beforeEach(() => {
    toString.mockReset();
    TestBed.configureTestingModule({
      imports: [MyTicketsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MyTicketsPage);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('shows each ticket as a QR code of its signed code', async () => {
    toString.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    http.expectOne('/api/tickets/mine').flush([ticket]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page().querySelector('img.qr')).not.toBeNull();
    });

    const qr = page().querySelector<HTMLImageElement>('img.qr')!;
    expect(toString).toHaveBeenCalledWith(ticket.code, expect.objectContaining({ type: 'svg' }));
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(atob(qr.getAttribute('src')!.split(',')[1])).toContain('<svg');
    expect(qr.alt).toContain('Tech Talks Night');
  });

  it('lists the tickets straight away, before any QR code is drawn', async () => {
    toString.mockReturnValue(new Promise(() => undefined));

    http.expectOne('/api/tickets/mine').flush([ticket]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(page().textContent).not.toContain('Loading your tickets');
    expect(page().textContent).toContain('Tech Talks Night');
  });

  it('shows the code as text if the QR code cannot be drawn', async () => {
    toString.mockRejectedValue(new Error('no QR for you'));

    http.expectOne('/api/tickets/mine').flush([ticket]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page().querySelector('.qr-fallback')).not.toBeNull();
    });

    expect(page().querySelector('.qr-fallback code')?.textContent).toBe(ticket.code);
    expect(page().textContent).not.toContain('Loading your tickets');
  });
});
