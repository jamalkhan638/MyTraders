import { randomUUID } from 'node:crypto';
import { ApiClient, BOOKER_ONLY_MESSAGE } from '../api/client';
import { ApiError, SessionEndedError } from '../api/errors';
import {
  clearOwnerCache,
  countByStatus,
  getOrder,
  listMyOrders,
  listProducts,
  listShops,
  retryNow,
} from '../db/repo';
import { type LocalDb } from '../db/sql';
import { bookOrder } from '../orders/book';
import { FakeServer } from '../test/fake-server';
import { MemoryKV } from '../test/memory-kv';
import { nodeDb } from '../test/node-db';
import { BACK_ONLINE_TEXT, type SyncNotice, SyncController } from './controller';
import { SyncService } from './sync-service';

const API = 'https://api.supplybeacon.test/api';

/** One phone: its database, secure store, API client, sync engine and the notices it showed. */
async function phone(server: FakeServer, db?: LocalDb) {
  const kv = new MemoryKV();
  const ended: string[] = [];
  const api = new ApiClient({
    baseUrl: API,
    store: kv,
    fetch: server.fetch,
    onSessionEnded: (r) => ended.push(r),
  });
  return { db: db ?? (await nodeDb()), kv, api, ended };
}

function world() {
  const server = new FakeServer();
  const org = server.addOrg('Ali Akbar Traders');
  const booker = server.addUser({ role: 'ORDER_BOOKER', orgId: org.id, name: 'Ahmed' });
  const shop = server.addShop({ orgId: org.id, bookerId: booker.id, name: 'Bilal Store' });
  const shop2 = server.addShop({
    orgId: org.id,
    bookerId: booker.id,
    name: 'City Mart',
    areaId: 'area-2',
    areaName: 'Cantt',
  });
  const tin = server.addProduct({ orgId: org.id, name: 'Dalda Tin 2.5kg', type: 'TIN' });
  const pouch = server.addProduct({ orgId: org.id, name: 'Dalda Pouch 1kg', type: 'POUCH' });
  return { server, org, booker, shop, shop2, tin, pouch };
}

async function signedIn(w: ReturnType<typeof world>, db?: LocalDb) {
  const p = await phone(w.server, db);
  const user = await p.api.login(w.booker.email, 'Password@123');
  const service = new SyncService(p.db, p.api, user.id);
  const notices: SyncNotice[] = [];
  const controller = new SyncController(service, (n) => notices.push(n));
  return { ...p, user, service, controller, notices };
}

const book = (
  s: Awaited<ReturnType<typeof signedIn>>,
  shop: { id: string; name: string },
  lines: {
    productId: string;
    productName: string;
    productType: 'TIN' | 'POUCH';
    quantity: number;
  }[],
  existing?: string,
) =>
  bookOrder(
    s.db,
    { owner: s.user.id, orgId: s.user.organization!.id, now: Date.now(), uuid: randomUUID },
    { id: shop.id, name: shop.name, areaName: 'Saddar' },
    { lines },
    existing,
  );

describe('sign-in', () => {
  it('online login keeps the refresh token in secure storage, never the access token', async () => {
    const w = world();
    const s = await signedIn(w);
    expect(s.user).toMatchObject({ id: w.booker.id, role: 'ORDER_BOOKER' });
    expect(s.kv.data.get('sb.refreshToken')).toEqual(expect.any(String));
    expect([...s.kv.data.values()].join()).not.toContain('accessToken');
    expect(await s.api.savedUser()).toMatchObject({ id: w.booker.id });
  });

  it('Admin / Super Admin credentials are refused with a clear message and nothing is stored', async () => {
    const w = world();
    const admin = w.server.addUser({ role: 'ADMIN', orgId: w.org.id });
    const p = await phone(w.server);
    await expect(p.api.login(admin.email, 'Password@123')).rejects.toThrow(BOOKER_ONLY_MESSAGE);
    expect(p.kv.data.size).toBe(0);
    await expect(p.api.login(w.booker.email, 'wrong')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('offline cache', () => {
  it('shops, areas and products stay available after the network goes away', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true); // first online run downloads master data
    w.server.offline = true;
    const shops = await listShops(s.db, s.user.id);
    // ordered by area (Cantt, Saddar), then name
    expect(shops.map((x) => x.name)).toEqual(['City Mart', 'Bilal Store']);
    expect((await listShops(s.db, s.user.id, { areaId: 'area-2' })).map((x) => x.name)).toEqual([
      'City Mart',
    ]);
    expect((await listShops(s.db, s.user.id, { q: 'bilal' })).map((x) => x.name)).toEqual([
      'Bilal Store',
    ]);
    const products = await listProducts(s.db, s.user.id);
    expect(products.map((p) => [p.name, p.type])).toEqual([
      ['Dalda Pouch 1kg', 'POUCH'],
      ['Dalda Tin 2.5kg', 'TIN'],
    ]);
    expect(await s.service.lastSync()).toEqual(expect.any(Number));
  });
});

describe('booking offline and syncing', () => {
  it('an order booked offline is saved locally as PENDING_SYNC and nothing reaches the server', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    await s.controller.connectivityChanged(false);
    w.server.offline = true;
    const id = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 12 },
      { productId: w.pouch.id, productName: 'Dalda Pouch 1kg', productType: 'POUCH', quantity: 3 },
    ]);
    expect(await s.controller.orderSaved()).toBeNull(); // offline: no attempt
    const order = await getOrder(s.db, s.user.id, id);
    expect(order).toMatchObject({ status: 'PENDING_SYNC', label: 'Local-001', serverNumber: null });
    expect(order!.items).toHaveLength(2);
    expect(w.server.orderPosts).toBe(0);
  });

  it('connection returns → pending orders sync automatically; server number and time are stored', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    await s.controller.connectivityChanged(false);
    w.server.offline = true;
    const a = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    const b = await book(s, w.shop2, [
      { productId: w.pouch.id, productName: 'Dalda Pouch 1kg', productType: 'POUCH', quantity: 2 },
    ]);
    w.server.offline = false;
    const report = await s.controller.connectivityChanged(true);
    expect(report).toMatchObject({ synced: 2, rejected: 0 });
    expect(s.notices.map((n) => n.text)).toEqual([
      BACK_ONLINE_TEXT,
      '2 orders synced successfully.',
    ]);
    const first = await getOrder(s.db, s.user.id, a);
    expect(first).toMatchObject({
      status: 'SYNCED',
      serverNumber: 'ORD-000001',
      label: 'ORD-000001',
      syncedAt: expect.any(Number),
    });
    expect((await getOrder(s.db, s.user.id, b))!.serverNumber).toBe('ORD-000002');
    // sent with its local id as clientOrderId, in booking order
    expect(w.server.orders.map((o) => o.clientOrderId)).toEqual([a, b]);
  });

  it('manual Sync Now sends what is waiting; offline it just says so', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(false);
    w.server.offline = true;
    await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 5 },
    ]);
    expect(await s.controller.syncNow()).toBeNull();
    expect(s.notices.at(-1)?.text).toMatch(/You are offline/);
    w.server.offline = false;
    // NetInfo may lag: the controller still believes it is offline until told otherwise
    await s.controller.connectivityChanged(true);
    expect(w.server.orders).toHaveLength(1);
    const again = await s.controller.syncNow();
    expect(again).toMatchObject({ synced: 0, masterData: true });
    expect(w.server.orders).toHaveLength(1);
  });

  it('weak signal: reply lost after the server saved the order → retry returns the SAME order', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    const id = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 7 },
    ]);
    w.server.dropReplies = 2; // saved twice-over on the server side, phone never hears back
    expect(await s.controller.orderSaved()).toMatchObject({ synced: 0, stopped: 'offline' });
    expect(await getOrder(s.db, s.user.id, id)).toMatchObject({ status: 'PENDING_SYNC' });
    await s.service.syncOrders(); // second lost reply
    await s.service.syncOrders(); // this time the reply arrives
    expect(w.server.orderPosts).toBe(3);
    expect(w.server.orders).toHaveLength(1); // one order, however many retries
    expect(await getOrder(s.db, s.user.id, id)).toMatchObject({
      status: 'SYNCED',
      serverNumber: w.server.orders[0].orderNumber,
    });
  });

  it('concurrent sync triggers share one run — an order is never sent twice in parallel', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    const posts = w.server.orderPosts;
    await Promise.all([s.service.syncOrders(), s.service.syncOrders(), s.controller.tick()]);
    expect(w.server.orderPosts - posts).toBe(1);
  });

  it('server error (5xx) → FAILED but retried automatically after a wait', async () => {
    const w = world();
    let now = 1_000_000;
    const s = await signedIn(w);
    const service = new SyncService(s.db, s.api, s.user.id, () => now);
    const id = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    w.server.fail5xx = 1;
    expect(await service.syncOrders()).toMatchObject({ retrying: 1 });
    expect(await getOrder(s.db, s.user.id, id)).toMatchObject({
      status: 'FAILED',
      retryable: true,
    });
    expect(await service.syncOrders()).toMatchObject({ synced: 0 }); // still waiting
    now += 31_000;
    expect(await service.syncOrders()).toMatchObject({ synced: 1 });
  });
});

describe('the server is the authority', () => {
  it('product deactivated while offline → FAILED with a clear reason, not retried; fixed order syncs once', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    await s.controller.connectivityChanged(false);
    w.server.offline = true;
    const id = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
      { productId: w.pouch.id, productName: 'Dalda Pouch 1kg', productType: 'POUCH', quantity: 2 },
    ]);
    w.server.products.find((p) => p.id === w.pouch.id)!.active = false; // Admin, meanwhile
    w.server.offline = false;
    expect(await s.controller.connectivityChanged(true)).toMatchObject({ rejected: 1 });
    const failed = await getOrder(s.db, s.user.id, id);
    expect(failed).toMatchObject({ status: 'FAILED', retryable: false });
    expect(failed!.lastError).toBe(
      'Product Dalda Pouch 1kg is no longer active. Edit the order and try again.',
    );
    expect(s.notices.at(-1)?.text).toMatch(/could not be sent/);
    // not retried by itself
    await s.service.syncOrders();
    expect(w.server.orders).toHaveLength(0);
    expect(await countByStatus(s.db, s.user.id)).toMatchObject({ failed: 1, pending: 0 });
    // the booker removes the product and resubmits the same local order
    await book(
      s,
      w.shop,
      [{ productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 }],
      id,
    );
    expect(await s.controller.orderSaved()).toMatchObject({ synced: 1 });
    expect(w.server.orders).toHaveLength(1);
    expect(w.server.orders[0]).toMatchObject({ clientOrderId: id, items: [{ quantity: 1 }] });
    expect(await getOrder(s.db, s.user.id, id)).toMatchObject({
      status: 'SYNCED',
      label: w.server.orders[0].orderNumber,
    });
  });

  it('shop deactivated or no longer assigned → FAILED with the reason', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    const a = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    const b = await book(s, w.shop2, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    w.server.shops.find((x) => x.id === w.shop.id)!.active = false;
    w.server.shops.find((x) => x.id === w.shop2.id)!.bookerId = 'someone-else';
    expect(await s.service.syncOrders()).toMatchObject({ rejected: 2 });
    expect((await getOrder(s.db, s.user.id, a))!.lastError).toBe(
      'Bilal Store is no longer active. This order cannot be sent.',
    );
    expect((await getOrder(s.db, s.user.id, b))!.lastError).toBe(
      'City Mart is no longer assigned to you. This order cannot be sent.',
    );
  });

  it('"Retry" on a failed order sends it again at the next sync', async () => {
    const w = world();
    const s = await signedIn(w);
    const id = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    w.server.shops.find((x) => x.id === w.shop.id)!.active = false;
    await s.service.syncOrders();
    w.server.shops.find((x) => x.id === w.shop.id)!.active = true; // Admin re-activated it
    await retryNow(s.db, s.user.id, id, Date.now());
    expect(await s.service.syncOrders()).toMatchObject({ synced: 1 });
  });

  it('disabled booker: sync stops, orders stay safe on the phone, the reason is shown', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    const id = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    w.booker.active = false;
    const report = await s.controller.orderSaved();
    expect(report).toMatchObject({ synced: 0, stopped: 'session' });
    expect(s.notices.at(-1)).toEqual({ kind: 'session-ended', text: 'Your account is inactive' });
    expect(s.ended).toEqual(['Your account is inactive']);
    expect(await getOrder(s.db, s.user.id, id)).toMatchObject({ status: 'PENDING_SYNC' });
    expect(w.server.orders).toHaveLength(0);
    expect(s.kv.data.size).toBe(0); // signed out on this phone
  });

  it('suspended organization: same — nothing is sent, nothing is lost', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    const id = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    w.server.suspended.add(w.org.id);
    expect(await s.controller.orderSaved()).toMatchObject({ stopped: 'session' });
    expect(s.notices.at(-1)?.text).toBe('Your organization is suspended');
    expect(await getOrder(s.db, s.user.id, id)).toMatchObject({ status: 'PENDING_SYNC' });
    await expect(s.api.me()).rejects.toBeInstanceOf(SessionEndedError);
  });
});

describe('My Orders', () => {
  it('shows local and server orders once each (no duplicate after sync)', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    // an order made earlier on another device / the web
    const other = await signedIn(w);
    await book(other, w.shop2, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    await other.service.syncOrders();
    const synced = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    await s.service.syncAll();
    w.server.offline = true;
    await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 2 },
    ]);
    const rows = await listMyOrders(s.db, s.user.id);
    const labels = rows.map((r) => (r.kind === 'local' ? r.order.label : r.order.orderNumber));
    expect(labels.sort()).toEqual(['Local-002', 'ORD-000001', 'ORD-000002']);
    expect(rows.find((r) => r.kind === 'local' && r.order.localId === synced)).toBeDefined();
    expect(rows.filter((r) => r.kind === 'server')).toHaveLength(1);
  });
});

describe('isolation on a shared phone', () => {
  it('sign-out removes cached business data but keeps unsent orders (owner-only)', async () => {
    const w = world();
    const s = await signedIn(w);
    await s.controller.connectivityChanged(true);
    await s.controller.connectivityChanged(false);
    w.server.offline = true;
    const pending = await book(s, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    await s.api.logout();
    await clearOwnerCache(s.db, s.user.id);
    expect(s.kv.data.size).toBe(0);
    expect(await listShops(s.db, s.user.id)).toEqual([]);
    expect(await listProducts(s.db, s.user.id)).toEqual([]);
    expect(await getOrder(s.db, s.user.id, pending)).toMatchObject({ status: 'PENDING_SYNC' });
  });

  it('another booker / another organization on the same phone never sees the first one’s data', async () => {
    const w = world();
    const first = await signedIn(w);
    await first.controller.connectivityChanged(true);
    const firstOrder = await book(first, w.shop, [
      { productId: w.tin.id, productName: 'Dalda Tin 2.5kg', productType: 'TIN', quantity: 1 },
    ]);
    await first.api.logout();
    await clearOwnerCache(first.db, first.user.id);

    // Org B's booker signs in on the same phone (same database file)
    const orgB = w.server.addOrg('Org B');
    const bookerB = w.server.addUser({ role: 'ORDER_BOOKER', orgId: orgB.id });
    w.server.addShop({ orgId: orgB.id, bookerId: bookerB.id, name: 'B Store' });
    const p = await phone(w.server, first.db);
    const userB = await p.api.login(bookerB.email, 'Password@123');
    const serviceB = new SyncService(first.db, p.api, userB.id);
    await serviceB.syncAll();
    expect((await listShops(first.db, userB.id)).map((x) => x.name)).toEqual(['B Store']);
    expect(await listProducts(first.db, userB.id)).toEqual([]);
    expect(await getOrder(first.db, userB.id, firstOrder)).toBeNull();
    expect(await listMyOrders(first.db, userB.id)).toEqual([]);
    // B's sync never sends A's order; it waits on the phone for its own booker
    expect(w.server.orders).toHaveLength(0);
    expect(await getOrder(first.db, first.user.id, firstOrder)).toMatchObject({
      status: 'PENDING_SYNC',
    });
  });
});
