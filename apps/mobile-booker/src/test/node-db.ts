import { type LocalDb, migrate, type SqlValue } from '../db/sql';

interface SyncDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...p: SqlValue[]): unknown;
    all(...p: SqlValue[]): unknown[];
    get(...p: SqlValue[]): unknown;
  };
}

/** A real SQLite database (Node's built-in node:sqlite) behind the app's LocalDb contract. */
export async function nodeDb(): Promise<LocalDb> {
  // getBuiltinModule avoids Jest's resolver, which does not know the new node:sqlite module
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as {
    DatabaseSync: new (path: string) => SyncDb;
  };
  const sqlite = new DatabaseSync(':memory:');
  const plain = <T>(row: unknown) => (row ? ({ ...(row as object) } as T) : null);
  const db: LocalDb = {
    exec: async (sql) => sqlite.exec(sql),
    run: async (sql, params = []) => {
      sqlite.prepare(sql).run(...params);
    },
    all: async <T>(sql: string, params: SqlValue[] = []) =>
      sqlite
        .prepare(sql)
        .all(...params)
        .map((r) => plain<T>(r)!) as T[],
    first: async <T>(sql: string, params: SqlValue[] = []) =>
      plain<T>(sqlite.prepare(sql).get(...params)),
    transaction: async (task) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  await migrate(db);
  return db;
}
