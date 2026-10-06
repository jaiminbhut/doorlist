import * as SQLite from 'expo-sqlite';

/**
 * The schema, one step per version, tracked in PRAGMA user_version (ADR 9).
 * A step that has shipped is never edited: changes are a new step.
 */
const migrations: string[] = [
  // 1. My tickets, cached so their QR codes show offline.
  `CREATE TABLE settings (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );
   CREATE TABLE tickets (
     id TEXT PRIMARY KEY NOT NULL,
     position INTEGER NOT NULL,
     event_id INTEGER NOT NULL,
     event_name TEXT NOT NULL,
     venue TEXT NOT NULL,
     starts_at TEXT NOT NULL,
     ticket_type_name TEXT NOT NULL,
     issued_at TEXT NOT NULL,
     code TEXT NOT NULL
   );`,

  // 2. The door, offline (ADR 8): scans waiting for the server, in the order
  //    they were made, and the tickets this device has let in.
  `CREATE TABLE door_queue (
     position INTEGER PRIMARY KEY AUTOINCREMENT,
     scan_id TEXT NOT NULL UNIQUE,
     event_id INTEGER NOT NULL,
     code TEXT NOT NULL,
     scanned_at TEXT NOT NULL
   );
   CREATE INDEX door_queue_event ON door_queue (event_id);
   CREATE TABLE door_admitted (
     event_id INTEGER NOT NULL,
     ticket_id TEXT NOT NULL,
     PRIMARY KEY (event_id, ticket_id)
   );`,
];

export type Database = SQLite.SQLiteDatabase;

let opening: Promise<Database> | null = null;

/** The app's one database, opened and brought up to date on first use. */
export function database(): Promise<Database> {
  opening ??= open().catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

async function open(): Promise<Database> {
  const db = await SQLite.openDatabaseAsync('doorlist.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await migrate(db);
  return db;
}

async function migrate(db: Database): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let version = row?.user_version ?? 0; version < migrations.length; version++) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(migrations[version]);
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export async function setting(db: Database, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(db: Database, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
