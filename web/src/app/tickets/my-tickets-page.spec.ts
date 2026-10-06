import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyTicketsPage } from './my-tickets-page';

describe('MyTicketsPage', () => {
  it('shows each ticket as a QR code of its signed code', async () => {
    TestBed.configureTestingModule({
      imports: [MyTicketsPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(MyTicketsPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne('/api/tickets/mine').flush([
      {
        id: '0192c3d4-0000-7000-8000-000000000001',
        eventId: 1,
        eventName: 'Tech Talks Night',
        venue: 'Main Hall',
        startsAt: '2026-11-20T18:00:00Z',
        ticketTypeName: 'General admission',
        issuedAt: '2026-10-06T09:00:00Z',
        code: 'DL1.AZLD1AAAcACAAAAAAAAAAQAAAAE.signature',
      },
    ]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('img.qr')).not.toBeNull();
    });

    const qr = (fixture.nativeElement as HTMLElement).querySelector<HTMLImageElement>('img.qr')!;
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(atob(qr.getAttribute('src')!.split(',')[1])).toContain('<svg');
    expect(qr.alt).toContain('Tech Talks Night');
    http.verify();
  });
});
