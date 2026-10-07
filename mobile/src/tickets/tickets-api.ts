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

/** The most tickets one attendee can hold for one event, as the API enforces (ADR 7). */
export const MAX_TICKETS_PER_ATTENDEE = 4;

export function myTickets(token: string): Promise<Ticket[]> {
  return request<Ticket[]>('/api/tickets/mine', { token });
}

/** Claims tickets of one type. The API answers with the new tickets. */
export function claimTickets(
  eventId: number,
  token: string,
  ticketTypeId: number,
  quantity: number,
): Promise<Ticket[]> {
  return request<Ticket[]>(`/api/events/${eventId}/tickets`, {
    method: 'POST',
    token,
    body: { ticketTypeId, quantity },
  });
}
