import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Ticket, TicketsApi } from './tickets-api';

interface TicketWithQr extends Ticket {
  /** An SVG data URL: allowed by the Content-Security-Policy (img-src data:), and drawn without a canvas. */
  qr: string;
}

@Component({
  selector: 'app-my-tickets-page',
  imports: [RouterLink, DatePipe],
  templateUrl: './my-tickets-page.html',
  styleUrl: './my-tickets-page.css',
})
export class MyTicketsPage implements OnInit {
  private readonly api = inject(TicketsApi);

  protected readonly tickets = signal<TicketWithQr[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    this.api.mine().subscribe({
      next: async (tickets) => {
        this.tickets.set(
          await Promise.all(
            tickets.map(async (ticket) => ({ ...ticket, qr: await toQr(ticket.code) })),
          ),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load your tickets.');
        this.loading.set(false);
      },
    });
  }
}

/** The QR library is loaded only when someone opens their tickets, not with every page. */
async function toQr(code: string): Promise<string> {
  const { toString: qrSvg } = await import('qrcode');
  const svg = await qrSvg(code, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
