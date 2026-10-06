import { DoorlistEvent } from '../events/events-api';

/** A published event with one ticket type; override what a test cares about. */
export const anEvent = (overrides: Partial<DoorlistEvent> = {}): DoorlistEvent => ({
  id: 1,
  name: 'Tech Talks Night',
  venue: 'Main Hall',
  description: 'An evening of short talks.',
  startsAt: '2026-11-20T18:00:00Z',
  endsAt: '2026-11-20T21:00:00Z',
  status: 'published',
  ticketTypes: [{ id: 10, name: 'General admission', capacity: 50, remaining: 12 }],
  ...overrides,
});
