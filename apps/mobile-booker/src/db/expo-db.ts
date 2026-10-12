import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { type LocalDb, migrate, type SqlValue } from './sql';

/** The phone's database file (app-private storage). */
export async function openLocalDb(name = 'supplybeacon-booker.db'): Promise<LocalDb> {
  const sqlite = await openDatabaseAsync(name);
  const db = wrap(sqlite);
  await db.exec('PRAGMA journal_mode = WAL;');
  await migrate(db);
  return db;
}

function wrap(sqlite: SQLiteDatabase): LocalDb {
  return {
    exec: (sql) => sqlite.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => {
      await sqlite.runAsync(sql, params);
    },
    all: (sql, params: SqlValue[] = []) => sqlite.getAllAsync(sql, params),
    first: (sql, params: SqlValue[] = []) => sqlite.getFirstAsync(sql, params),
    transaction: (task) => sqlite.withTransactionAsync(task),
  };
}
