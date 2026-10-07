import { request } from '@/api/client';

/** One kind of ticket for an event, with how many are left to claim. */
export interface TicketType {
  id: number;
  name: string;
  capacity: number;
  remaining: number;
}

/** A published event as GET /api/events returns it. */
export interface DoorlistEvent {
  id: number;
  name: string;
  venue: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  ticketTypes: TicketType[];
}

/** Published events that haven't ended, soonest first. Anyone can list them. */
export function listEvents(): Promise<DoorlistEvent[]> {
  return request<DoorlistEvent[]>('/api/events');
}

export function getEvent(id: number): Promise<DoorlistEvent> {
  return request<DoorlistEvent>(`/api/events/${id}`);
}

/** The tickets still free across an event's ticket types. */
export function remaining(event: DoorlistEvent): number {
  return event.ticketTypes.reduce((sum, type) => sum + type.remaining, 0);
}
