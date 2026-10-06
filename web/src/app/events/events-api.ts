import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type EventStatus = 'draft' | 'published';

export interface TicketType {
  id: number;
  name: string;
  capacity: number;
  remaining: number;
}

/** Mirrors the API's EventResponse. "Event" would clash with the DOM's Event type. */
export interface DoorlistEvent {
  id: number;
  name: string;
  venue: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  ticketTypes: TicketType[];
}

export interface NewEvent {
  name: string;
  venue: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
}

@Injectable({ providedIn: 'root' })
export class EventsApi {
  private readonly http = inject(HttpClient);

  /** Published events that haven't ended, for everyone. */
  list(): Observable<DoorlistEvent[]> {
    return this.http.get<DoorlistEvent[]>('/api/events');
  }

  get(id: number): Observable<DoorlistEvent> {
    return this.http.get<DoorlistEvent>(`/api/events/${id}`);
  }

  /** Every event, drafts included, for organizers. */
  listForOrganizers(): Observable<DoorlistEvent[]> {
    return this.http.get<DoorlistEvent[]>('/api/organizer/events');
  }

  create(event: NewEvent): Observable<DoorlistEvent> {
    return this.http.post<DoorlistEvent>('/api/events', event);
  }

  addTicketType(eventId: number, name: string, capacity: number): Observable<TicketType> {
    return this.http.post<TicketType>(`/api/events/${eventId}/ticket-types`, { name, capacity });
  }

  publish(eventId: number): Observable<DoorlistEvent> {
    return this.http.post<DoorlistEvent>(`/api/events/${eventId}/publish`, null);
  }
}
