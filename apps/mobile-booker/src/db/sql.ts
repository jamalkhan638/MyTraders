/** SQL parameter values the app binds. */
export type SqlValue = string | number | null;

/**
 * The small slice of SQLite the app uses. Implemented by expo-sqlite on the phone and by
 * Node's built-in sqlite in tests, so the sync logic is tested against real SQL.
 */
export interface LocalDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  /** runs `task` in one transaction (all or nothing) */
  transaction(task: () => Promise<void>): Promise<void>;
}

/**
 * Local schema (version 1). Every business row carries `owner_id` = the signed-in user's id, and
 * every query filters on it: another user (or organization) signing in on the same phone never
 * sees these rows. Auth tokens are never stored here — they live in SecureStore.
 */
export const SCHEMA_VERSION = 1;
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  owner_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (owner_id, key)
);
CREATE TABLE IF NOT EXISTS areas (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  shop_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, id)
);
CREATE TABLE IF NOT EXISTS shops (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  area_id TEXT NOT NULL,
  area_name TEXT NOT NULL,
  PRIMARY KEY (owner_id, id)
);
CREATE TABLE IF NOT EXISTS products (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  type TEXT NOT NULL,
  pieces_per_carton INTEGER,
  PRIMARY KEY (owner_id, id)
);
CREATE TABLE IF NOT EXISTS orders (
  local_id TEXT PRIMARY KEY,          -- = clientOrderId sent to the server (UUID)
  owner_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  local_number INTEGER NOT NULL,      -- shown as Local-001
  shop_id TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  area_name TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL,               -- DRAFT | PENDING_SYNC | SYNCING | SYNCED | FAILED
  retryable INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  last_error TEXT,
  server_id TEXT,
  server_number TEXT,
  server_status TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  synced_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_owner_status ON orders (owner_id, status);
CREATE TABLE IF NOT EXISTS order_items (
  order_local_id TEXT NOT NULL REFERENCES orders (local_id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY (order_local_id, line_no)
);
CREATE TABLE IF NOT EXISTS server_orders (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  client_order_id TEXT,
  shop_name TEXT NOT NULL,
  area_name TEXT NOT NULL,
  status TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  total_pieces INTEGER NOT NULL,
  total_cartons INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, id)
);
`;

export async function migrate(db: LocalDb): Promise<void> {
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(SCHEMA);
}
