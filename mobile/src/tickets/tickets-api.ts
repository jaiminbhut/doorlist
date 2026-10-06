import { request } from '@/api/client';

/** A ticket as GET /api/tickets/mine returns it. The code is what the QR encodes (ADR 7). */
export interface Ticket {
  id: string;
  eventId: number;
  eventName: string;
  venue: string;
  startsAt: string;
  ticketTypeName: string;
  issuedAt: string;
  code: string;
}

export function myTickets(token: string): Promise<Ticket[]> {
  return request<Ticket[]>('/api/tickets/mine', { token });
}
