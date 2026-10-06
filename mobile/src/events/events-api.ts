import { request } from '@/api/client';

/** A published event as GET /api/events returns it. */
export interface DoorlistEvent {
  id: number;
  name: string;
  venue: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
}

/** Published events that haven't ended, soonest first. Anyone can list them. */
export function listEvents(): Promise<DoorlistEvent[]> {
  return request<DoorlistEvent[]>('/api/events');
}
