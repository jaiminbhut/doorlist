import { database, setting, setSetting } from '@/storage/database';
import type { Scan } from './checkin-api';

/**
 * What a door device keeps between launches (ADR 8, ADR 9): scans waiting
 * for the server, and the tickets it has let in, per event. They belong to
 * the device and the event, not to whoever is signed in, so signing out
 * keeps them until they sync.
 */

/** Scans not yet answered by the server, oldest first. */
export async function queuedScans(eventId: number, limit = 1_000): Promise<Scan[]> {
  const db = await database();
  return db.getAllAsync<Scan>(
    `SELECT scan_id AS scanId, code, scanned_at AS scannedAt
       FROM door_queue WHERE event_id = ? ORDER BY position LIMIT ?`,
    eventId,
    limit,
  );
}

export async function queuedCount(eventId?: number): Promise<number> {
  const db = await database();
  const row =
    eventId === undefined
      ? await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM door_queue')
      : await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) AS count FROM door_queue WHERE event_id = ?',
          eventId,
        );
  return row?.count ?? 0;
}

/**
 * Lets a ticket in offline, unless this device already has. Checking and
 * recording happen in one transaction, so two quick scans can't both admit
 * it, and a crash can't record the admission without its queued scan.
 */
export async function admitOffline(
  eventId: number,
  ticketId: string,
  scan: Scan,
): Promise<'admitted' | 'alreadyAdmittedHere'> {
  const db = await database();
  let outcome: 'admitted' | 'alreadyAdmittedHere' = 'admitted';
  await db.withExclusiveTransactionAsync(async (txn) => {
    const added = await txn.runAsync(
      'INSERT OR IGNORE INTO door_admitted (event_id, ticket_id) VALUES (?, ?)',
      eventId,
      ticketId,
    );
    if (added.changes === 0) {
      outcome = 'alreadyAdmittedHere';
      return;
    }
    await txn.runAsync(
      'INSERT INTO door_queue (scan_id, event_id, code, scanned_at) VALUES (?, ?, ?, ?)',
      scan.scanId,
      eventId,
      scan.code,
      scan.scannedAt,
    );
  });
  return outcome;
}

/**
 * Remembers a ticket the server says has been let in, here or elsewhere, so
 * that if the connection drops, this device refuses it on its own.
 */
export async function rememberAdmitted(eventId: number, ticketId: string): Promise<void> {
  const db = await database();
  await db.runAsync(
    'INSERT OR IGNORE INTO door_admitted (event_id, ticket_id) VALUES (?, ?)',
    eventId,
    ticketId,
  );
}

/** Drops scans the server has answered. Anything queued since stays. */
export async function removeFromQueue(scanIds: string[]): Promise<void> {
  if (scanIds.length === 0) {
    return;
  }
  const db = await database();
  await db.runAsync(
    `DELETE FROM door_queue WHERE scan_id IN (${scanIds.map(() => '?').join(', ')})`,
    scanIds,
  );
}

export interface CachedSigningKey {
  keyId: string;
  publicKey: string;
}

/** The public key for checking codes offline, as last fetched. */
export async function cachedSigningKey(): Promise<CachedSigningKey | null> {
  const text = await setting(await database(), 'door.signingKey');
  try {
    return text ? (JSON.parse(text) as CachedSigningKey) : null;
  } catch {
    return null;
  }
}

export async function cacheSigningKey(key: CachedSigningKey): Promise<void> {
  await setSetting(
    await database(),
    'door.signingKey',
    JSON.stringify({ keyId: key.keyId, publicKey: key.publicKey }),
  );
}
