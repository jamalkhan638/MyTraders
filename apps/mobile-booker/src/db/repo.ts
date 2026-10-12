import { type LocalDb, type SqlValue } from './sql';

/** Local life of an order on the phone (server order status is separate: PENDING / INVOICED …). */
export type SyncStatus = 'DRAFT' | 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'FAILED';
export type ProductType = 'TIN' | 'POUCH';

export interface LocalShop {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  areaId: string;
  areaName: string;
}
export interface LocalArea {
  id: string;
  name: string;
  shopCount: number;
}
export interface LocalProduct {
  id: string;
  name: string;
  code: string | null;
  type: ProductType;
  piecesPerCarton: number | null;
}
export interface LocalOrderLine {
  productId: string;
  productName: string;
  productType: ProductType;
  quantity: number;
}
export interface LocalOrder {
  localId: string;
  localNumber: number;
  /** Local-001 until synced, then the server number (ORD-000145) */
  label: string;
  shopId: string;
  shopName: string;
  areaName: string;
  notes: string | null;
  status: SyncStatus;
  /** FAILED only: true = temporary (network / server) and retried automatically */
  retryable: boolean;
  attempts: number;
  nextAttemptAt: number | null;
  lastError: string | null;
  serverId: string | null;
  serverNumber: string | null;
  serverStatus: string | null;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
  items: LocalOrderLine[];
}
export interface ServerOrder {
  id: string;
  orderNumber: string;
  clientOrderId: string | null;
  shopName: string;
  areaName: string;
  status: string;
  itemCount: number;
  totalPieces: number;
  totalCartons: number;
  createdAt: string;
}

/** One row of My Orders: a local order (any sync state) or a server order made elsewhere. */
export type MyOrderRow =
  { kind: 'local'; order: LocalOrder } | { kind: 'server'; order: ServerOrder };

export const localLabel = (n: number) => `Local-${String(n).padStart(3, '0')}`;

// ---- meta ------------------------------------------------------------------------------------

export async function getMeta(db: LocalDb, owner: string, key: string): Promise<string | null> {
  const row = await db.first<{ value: string }>(
    'SELECT value FROM meta WHERE owner_id = ? AND key = ?',
    [owner, key],
  );
  return row?.value ?? null;
}

export async function setMeta(db: LocalDb, owner: string, key: string, value: string) {
  await db.run(
    'INSERT INTO meta (owner_id, key, value) VALUES (?, ?, ?) ' +
      'ON CONFLICT (owner_id, key) DO UPDATE SET value = excluded.value',
    [owner, key, value],
  );
}

// ---- master data (read-only copies of the server; replaced on every sync) ---------------------

export async function replaceMasterData(
  db: LocalDb,
  owner: string,
  data: { shops: LocalShop[]; areas: LocalArea[]; products: LocalProduct[] },
  syncedAt: number,
): Promise<void> {
  await db.transaction(async () => {
    for (const table of ['shops', 'areas', 'products']) {
      await db.run(`DELETE FROM ${table} WHERE owner_id = ?`, [owner]);
    }
    for (const s of data.shops) {
      await db.run(
        'INSERT INTO shops (owner_id, id, name, contact_person, phone, address, area_id, area_name) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [owner, s.id, s.name, s.contactPerson, s.phone, s.address, s.areaId, s.areaName],
      );
    }
    for (const a of data.areas) {
      await db.run('INSERT INTO areas (owner_id, id, name, shop_count) VALUES (?, ?, ?, ?)', [
        owner,
        a.id,
        a.name,
        a.shopCount,
      ]);
    }
    for (const p of data.products) {
      await db.run(
        'INSERT INTO products (owner_id, id, name, code, type, pieces_per_carton) VALUES (?, ?, ?, ?, ?, ?)',
        [owner, p.id, p.name, p.code, p.type, p.piecesPerCarton],
      );
    }
    await setMeta(db, owner, 'last_master_sync', String(syncedAt));
  });
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listShops(
  db: LocalDb,
  owner: string,
  filter: { q?: string; areaId?: string } = {},
): Promise<LocalShop[]> {
  const where = ['owner_id = ?'];
  const params: SqlValue[] = [owner];
  if (filter.areaId) {
    where.push('area_id = ?');
    params.push(filter.areaId);
  }
  if (filter.q?.trim()) {
    where.push("(name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')");
    params.push(like(filter.q.trim()), like(filter.q.trim()));
  }
  const rows = await db.all<ShopRow>(
    `SELECT * FROM shops WHERE ${where.join(' AND ')} ORDER BY area_name, name`,
    params,
  );
  return rows.map(toShop);
}

export async function getShop(db: LocalDb, owner: string, id: string): Promise<LocalShop | null> {
  const row = await db.first<ShopRow>('SELECT * FROM shops WHERE owner_id = ? AND id = ?', [
    owner,
    id,
  ]);
  return row ? toShop(row) : null;
}

export async function listAreas(db: LocalDb, owner: string): Promise<LocalArea[]> {
  const rows = await db.all<{ id: string; name: string; shop_count: number }>(
    'SELECT id, name, shop_count FROM areas WHERE owner_id = ? ORDER BY name',
    [owner],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, shopCount: r.shop_count }));
}

export async function listProducts(
  db: LocalDb,
  owner: string,
  q?: string,
): Promise<LocalProduct[]> {
  const params: SqlValue[] = [owner];
  let where = 'owner_id = ?';
  if (q?.trim()) {
    where += " AND (name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\')";
    params.push(like(q.trim()), like(q.trim()));
  }
  const rows = await db.all<{
    id: string;
    name: string;
    code: string | null;
    type: ProductType;
    pieces_per_carton: number | null;
  }>(`SELECT * FROM products WHERE ${where} ORDER BY name`, params);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    type: r.type,
    piecesPerCarton: r.pieces_per_carton,
  }));
}

// ---- local orders ----------------------------------------------------------------------------

/**
 * Saves an order on the phone (new or a DRAFT / permanently FAILED one being corrected), with
 * its lines, in one transaction. The local id is the clientOrderId sent to the server.
 */
export async function saveOrder(
  db: LocalDb,
  input: {
    owner: string;
    orgId: string;
    localId: string;
    shop: Pick<LocalShop, 'id' | 'name' | 'areaName'>;
    lines: LocalOrderLine[];
    notes: string | null;
    status: 'DRAFT' | 'PENDING_SYNC';
    now: number;
  },
): Promise<void> {
  await db.transaction(async () => {
    const existing = await db.first<{ status: SyncStatus; retryable: number; owner_id: string }>(
      'SELECT status, retryable, owner_id FROM orders WHERE local_id = ?',
      [input.localId],
    );
    if (existing) {
      const editable =
        existing.owner_id === input.owner &&
        (existing.status === 'DRAFT' || (existing.status === 'FAILED' && !existing.retryable));
      if (!editable) throw new Error('This order can no longer be changed');
      await db.run(
        'UPDATE orders SET shop_id = ?, shop_name = ?, area_name = ?, notes = ?, status = ?, ' +
          'retryable = 0, attempts = 0, next_attempt_at = NULL, last_error = NULL, updated_at = ? ' +
          'WHERE local_id = ?',
        [
          input.shop.id,
          input.shop.name,
          input.shop.areaName,
          input.notes,
          input.status,
          input.now,
          input.localId,
        ],
      );
      await db.run('DELETE FROM order_items WHERE order_local_id = ?', [input.localId]);
    } else {
      const seq = Number((await getMeta(db, input.owner, 'local_seq')) ?? '0') + 1;
      await setMeta(db, input.owner, 'local_seq', String(seq));
      await db.run(
        'INSERT INTO orders (local_id, owner_id, org_id, local_number, shop_id, shop_name, area_name, ' +
          'notes, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          input.localId,
          input.owner,
          input.orgId,
          seq,
          input.shop.id,
          input.shop.name,
          input.shop.areaName,
          input.notes,
          input.status,
          input.now,
          input.now,
        ],
      );
    }
    let lineNo = 0;
    for (const line of input.lines) {
      await db.run(
        'INSERT INTO order_items (order_local_id, line_no, product_id, product_name, product_type, quantity) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
        [
          input.localId,
          ++lineNo,
          line.productId,
          line.productName,
          line.productType,
          line.quantity,
        ],
      );
    }
  });
}

export async function getOrder(
  db: LocalDb,
  owner: string,
  localId: string,
): Promise<LocalOrder | null> {
  const row = await db.first<OrderRow>('SELECT * FROM orders WHERE owner_id = ? AND local_id = ?', [
    owner,
    localId,
  ]);
  return row ? withItems(db, row) : null;
}

/** The current DRAFT for a shop (an order being prepared and not yet submitted). */
export async function getDraftForShop(
  db: LocalDb,
  owner: string,
  shopId: string,
): Promise<LocalOrder | null> {
  const row = await db.first<OrderRow>(
    "SELECT * FROM orders WHERE owner_id = ? AND shop_id = ? AND status = 'DRAFT' ORDER BY updated_at DESC",
    [owner, shopId],
  );
  return row ? withItems(db, row) : null;
}

export async function listLocalOrders(db: LocalDb, owner: string): Promise<LocalOrder[]> {
  const rows = await db.all<OrderRow>(
    "SELECT * FROM orders WHERE owner_id = ? AND status <> 'DRAFT' ORDER BY created_at DESC",
    [owner],
  );
  return Promise.all(rows.map((r) => withItems(db, r)));
}

/** Orders the sync engine should send now, oldest first. */
export async function ordersToSync(db: LocalDb, owner: string, now: number): Promise<LocalOrder[]> {
  const rows = await db.all<OrderRow>(
    "SELECT * FROM orders WHERE owner_id = ? AND (status = 'PENDING_SYNC' OR " +
      "(status = 'FAILED' AND retryable = 1 AND (next_attempt_at IS NULL OR next_attempt_at <= ?))) " +
      'ORDER BY created_at, local_number',
    [owner, now],
  );
  return Promise.all(rows.map((r) => withItems(db, r)));
}

export async function countByStatus(
  db: LocalDb,
  owner: string,
): Promise<{ pending: number; failed: number; failedRetrying: number }> {
  const rows = await db.all<{ status: SyncStatus; retryable: number; n: number }>(
    "SELECT status, retryable, COUNT(*) AS n FROM orders WHERE owner_id = ? AND status <> 'DRAFT' " +
      'GROUP BY status, retryable',
    [owner],
  );
  const n = (pred: (r: (typeof rows)[number]) => boolean) =>
    rows.filter(pred).reduce((sum, r) => sum + r.n, 0);
  return {
    pending: n((r) => r.status === 'PENDING_SYNC' || r.status === 'SYNCING'),
    failed: n((r) => r.status === 'FAILED' && !r.retryable),
    failedRetrying: n((r) => r.status === 'FAILED' && !!r.retryable),
  };
}

export async function markSyncing(db: LocalDb, localId: string, now: number) {
  await db.run(
    "UPDATE orders SET status = 'SYNCING', attempts = attempts + 1, updated_at = ? WHERE local_id = ?",
    [now, localId],
  );
}

export async function markSynced(
  db: LocalDb,
  localId: string,
  server: { id: string; orderNumber: string; status: string },
  now: number,
) {
  await db.run(
    "UPDATE orders SET status = 'SYNCED', retryable = 0, next_attempt_at = NULL, last_error = NULL, " +
      'server_id = ?, server_number = ?, server_status = ?, synced_at = ?, updated_at = ? WHERE local_id = ?',
    [server.id, server.orderNumber, server.status, now, now, localId],
  );
}

export async function markFailed(
  db: LocalDb,
  localId: string,
  failure: { message: string; retryable: boolean; nextAttemptAt: number | null },
  now: number,
) {
  await db.run(
    "UPDATE orders SET status = 'FAILED', retryable = ?, last_error = ?, next_attempt_at = ?, " +
      'updated_at = ? WHERE local_id = ?',
    [failure.retryable ? 1 : 0, failure.message, failure.nextAttemptAt, now, localId],
  );
}

/** Back to the queue without counting as a failure (e.g. the session must be renewed first). */
export async function markPending(db: LocalDb, localId: string, now: number) {
  await db.run("UPDATE orders SET status = 'PENDING_SYNC', updated_at = ? WHERE local_id = ?", [
    now,
    localId,
  ]);
}

/**
 * An order left SYNCING (app closed mid-send) goes back to the queue. Safe: resending the same
 * clientOrderId returns the order if the server already created it.
 */
export async function resetStuckSyncing(db: LocalDb, owner: string) {
  await db.run(
    "UPDATE orders SET status = 'PENDING_SYNC' WHERE owner_id = ? AND status = 'SYNCING'",
    [owner],
  );
}

/** "Retry" on a failed order: send it again at the next sync (no waiting). */
export async function retryNow(db: LocalDb, owner: string, localId: string, now: number) {
  await db.run(
    "UPDATE orders SET status = 'PENDING_SYNC', next_attempt_at = NULL, updated_at = ? " +
      "WHERE owner_id = ? AND local_id = ? AND status = 'FAILED'",
    [now, owner, localId],
  );
}

/** Discard a DRAFT or a permanently failed order (never a pending / synced one). */
export async function discardOrder(db: LocalDb, owner: string, localId: string) {
  await db.run(
    "DELETE FROM orders WHERE owner_id = ? AND local_id = ? AND (status = 'DRAFT' OR " +
      "(status = 'FAILED' AND retryable = 0))",
    [owner, localId],
  );
}

// ---- server order history (cached for My Orders offline) --------------------------------------

export async function replaceServerOrders(db: LocalDb, owner: string, orders: ServerOrder[]) {
  await db.transaction(async () => {
    await db.run('DELETE FROM server_orders WHERE owner_id = ?', [owner]);
    for (const o of orders) {
      await db.run(
        'INSERT INTO server_orders (owner_id, id, order_number, client_order_id, shop_name, area_name, ' +
          'status, item_count, total_pieces, total_cartons, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          owner,
          o.id,
          o.orderNumber,
          o.clientOrderId,
          o.shopName,
          o.areaName,
          o.status,
          o.itemCount,
          o.totalPieces,
          o.totalCartons,
          o.createdAt,
        ],
      );
      // keep the server status of my synced orders current (PENDING → INVOICED / CANCELLED)
      await db.run('UPDATE orders SET server_status = ? WHERE owner_id = ? AND server_id = ?', [
        o.status,
        owner,
        o.id,
      ]);
    }
  });
}

/**
 * My Orders: every local order (pending / failed / synced) plus server orders not made on this
 * phone. A synced order appears once — as the local row, matched by its clientOrderId / id.
 */
export async function listMyOrders(db: LocalDb, owner: string): Promise<MyOrderRow[]> {
  const local = await listLocalOrders(db, owner);
  const known = new Set<string>();
  for (const o of local) {
    known.add(o.localId);
    if (o.serverId) known.add(o.serverId);
  }
  const server = await db.all<ServerOrderRow>(
    'SELECT * FROM server_orders WHERE owner_id = ? ORDER BY created_at DESC',
    [owner],
  );
  const rows: MyOrderRow[] = [
    ...local.map((order) => ({ kind: 'local' as const, order })),
    ...server
      .filter((s) => !known.has(s.id) && !(s.client_order_id && known.has(s.client_order_id)))
      .map((s) => ({ kind: 'server' as const, order: toServerOrder(s) })),
  ];
  const time = (r: MyOrderRow) =>
    r.kind === 'local' ? r.order.createdAt : Date.parse(r.order.createdAt);
  return rows.sort((a, b) => time(b) - time(a));
}

// ---- sign-out --------------------------------------------------------------------------------

/**
 * Sign-out: removes this user's cached business data. Orders not yet on the server (draft,
 * pending, failed) are kept — still owned by this user only — so nothing booked is ever lost;
 * they sync the next time this user signs in. No other user can read them (owner filter).
 */
export async function clearOwnerCache(db: LocalDb, owner: string): Promise<void> {
  await db.transaction(async () => {
    for (const table of ['shops', 'areas', 'products', 'server_orders']) {
      await db.run(`DELETE FROM ${table} WHERE owner_id = ?`, [owner]);
    }
    await db.run("DELETE FROM orders WHERE owner_id = ? AND status = 'SYNCED'", [owner]);
    await db.run("DELETE FROM meta WHERE owner_id = ? AND key <> 'local_seq'", [owner]);
  });
}

// ---- row mapping -----------------------------------------------------------------------------

interface ShopRow {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  area_id: string;
  area_name: string;
}
interface OrderRow {
  local_id: string;
  local_number: number;
  shop_id: string;
  shop_name: string;
  area_name: string;
  notes: string | null;
  status: SyncStatus;
  retryable: number;
  attempts: number;
  next_attempt_at: number | null;
  last_error: string | null;
  server_id: string | null;
  server_number: string | null;
  server_status: string | null;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
}
interface ServerOrderRow {
  id: string;
  order_number: string;
  client_order_id: string | null;
  shop_name: string;
  area_name: string;
  status: string;
  item_count: number;
  total_pieces: number;
  total_cartons: number;
  created_at: string;
}

function toShop(r: ShopRow): LocalShop {
  return {
    id: r.id,
    name: r.name,
    contactPerson: r.contact_person,
    phone: r.phone,
    address: r.address,
    areaId: r.area_id,
    areaName: r.area_name,
  };
}

function toServerOrder(r: ServerOrderRow): ServerOrder {
  return {
    id: r.id,
    orderNumber: r.order_number,
    clientOrderId: r.client_order_id,
    shopName: r.shop_name,
    areaName: r.area_name,
    status: r.status,
    itemCount: r.item_count,
    totalPieces: r.total_pieces,
    totalCartons: r.total_cartons,
    createdAt: r.created_at,
  };
}

async function withItems(db: LocalDb, r: OrderRow): Promise<LocalOrder> {
  const items = await db.all<{
    product_id: string;
    product_name: string;
    product_type: ProductType;
    quantity: number;
  }>('SELECT * FROM order_items WHERE order_local_id = ? ORDER BY line_no', [r.local_id]);
  return {
    localId: r.local_id,
    localNumber: r.local_number,
    label: r.server_number ?? localLabel(r.local_number),
    shopId: r.shop_id,
    shopName: r.shop_name,
    areaName: r.area_name,
    notes: r.notes,
    status: r.status,
    retryable: !!r.retryable,
    attempts: r.attempts,
    nextAttemptAt: r.next_attempt_at,
    lastError: r.last_error,
    serverId: r.server_id,
    serverNumber: r.server_number,
    serverStatus: r.server_status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    syncedAt: r.synced_at,
    items: items.map((i) => ({
      productId: i.product_id,
      productName: i.product_name,
      productType: i.product_type,
      quantity: i.quantity,
    })),
  };
}
