import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Ticket {
  id: string;
  eventId: number;
  eventName: string;
  venue: string;
  startsAt: string;
  ticketTypeName: string;
  issuedAt: string;
  /** The signed code the QR shows (ADR 7). */
  code: string;
}

/** The API's limit on tickets per attendee per event. */
export const MAX_TICKETS_PER_ATTENDEE = 4;

@Injectable({ providedIn: 'root' })
export class TicketsApi {
  private readonly http = inject(HttpClient);

  claim(eventId: number, ticketTypeId: number, quantity: number): Observable<Ticket[]> {
    return this.http.post<Ticket[]>(`/api/events/${eventId}/tickets`, { ticketTypeId, quantity });
  }

  mine(): Observable<Ticket[]> {
    return this.http.get<Ticket[]>('/api/tickets/mine');
  }
}
