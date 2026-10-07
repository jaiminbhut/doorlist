import { database, setting, setSetting } from '@/storage/database';
import type { Ticket } from './tickets-api';

export interface CachedTickets {
  tickets: Ticket[];
  /** When the API last returned them. */
  fetchedAt: string;
}

interface TicketRow {
  id: string;
  event_id: number;
  event_name: string;
  venue: string;
  starts_at: string;
  ticket_type_name: string;
  issued_at: string;
  code: string;
}

/**
 * The tickets last fetched for this person, if there are any. The cache
 * belongs to one email: someone else signing in on the phone never sees it.
 */
export async function cachedTickets(owner: string): Promise<CachedTickets | null> {
  const db = await database();
  if ((await setting(db, 'tickets.owner')) !== owner) {
    return null;
  }
  const fetchedAt = await setting(db, 'tickets.fetchedAt');
  const rows = await db.getAllAsync<TicketRow>('SELECT * FROM tickets ORDER BY position');
  return fetchedAt
    ? {
        fetchedAt,
        tickets: rows.map((row) => ({
          id: row.id,
          eventId: row.event_id,
          eventName: row.event_name,
          venue: row.venue,
          startsAt: row.starts_at,
          ticketTypeName: row.ticket_type_name,
          issuedAt: row.issued_at,
          code: row.code,
        })),
      }
    : null;
}

/** Replaces the cache with what the API just returned, in the API's order. */
export async function cacheTickets(
  owner: string,
  tickets: Ticket[],
  fetchedAt: string,
): Promise<void> {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM tickets');
    for (const [position, ticket] of tickets.entries()) {
      await txn.runAsync(
        `INSERT INTO tickets
           (id, position, event_id, event_name, venue, starts_at, ticket_type_name, issued_at, code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ticket.id,
        position,
        ticket.eventId,
        ticket.eventName,
        ticket.venue,
        ticket.startsAt,
        ticket.ticketTypeName,
        ticket.issuedAt,
        ticket.code,
      );
    }
    await setSetting(txn, 'tickets.owner', owner);
    await setSetting(txn, 'tickets.fetchedAt', fetchedAt);
  });
}

/**
 * Adds tickets just claimed, before My tickets has fetched them: the next
 * place this phone goes may be a venue with no signal. Keeps the API's order,
 * by event then by when each ticket was issued.
 */
export async function addTickets(owner: string, added: Ticket[], savedAt: string): Promise<void> {
  const cached = await cachedTickets(owner);
  const tickets = [...(cached?.tickets ?? []), ...added].sort(
    (a, b) =>
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      Date.parse(a.issuedAt) - Date.parse(b.issuedAt),
  );
  await cacheTickets(owner, tickets, savedAt);
}

/** Signing out removes the tickets from the phone (ADR 9). */
export async function forgetTickets(): Promise<void> {
  const db = await database();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM tickets');
    await txn.runAsync("DELETE FROM settings WHERE key IN ('tickets.owner', 'tickets.fetchedAt')");
  });
}
