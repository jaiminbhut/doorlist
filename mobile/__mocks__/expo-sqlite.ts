// expo-sqlite for tests, on Node's built-in SQLite, so tests run the app's real
// SQL and transactions. Only the calls the app uses are here.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Params = SQLInputValue[];

function flatten(params: unknown[]): Params {
  return (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as Params;
}

class MockDatabase {
  readonly native = new DatabaseSync(':memory:');

  async execAsync(source: string): Promise<void> {
    this.native.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    const result = this.native.prepare(source).run(...flatten(params));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.native
      .prepare(source)
      .all(...flatten(params))
      .map((row) => ({ ...row }) as T);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    const row = this.native.prepare(source).get(...flatten(params));
    return row ? ({ ...row } as T) : null;
  }

  async withExclusiveTransactionAsync(task: (txn: MockDatabase) => Promise<void>): Promise<void> {
    this.native.exec('BEGIN');
    try {
      await task(this);
      this.native.exec('COMMIT');
    } catch (error) {
      this.native.exec('ROLLBACK');
      throw error;
    }
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    return this.withExclusiveTransactionAsync(() => task());
  }
}

const databases = new Map<string, MockDatabase>();

export async function openDatabaseAsync(name: string): Promise<MockDatabase> {
  let database = databases.get(name);
  if (!database) {
    database = new MockDatabase();
    databases.set(name, database);
  }
  return database;
}

export type SQLiteDatabase = MockDatabase;
