import { type ApiClient } from '../api/client';
import { ApiError, NetworkError, SessionEndedError } from '../api/errors';
import {
  getMeta,
  type LocalProduct,
  markFailed,
  markPending,
  markSynced,
  markSyncing,
  ordersToSync,
  replaceMasterData,
  replaceServerOrders,
  resetStuckSyncing,
  setMeta,
} from '../db/repo';
import { type LocalDb } from '../db/sql';
import { backoffMs, explainRejection, isTemporary } from './failure';

export interface SyncReport {
  /** orders that reached the server in this run */
  synced: number;
  /** orders the server refused for good (need the booker) */
  rejected: number;
  /** orders that hit a temporary server problem (retried automatically later) */
  retrying: number;
  masterData: boolean;
  /** why the run stopped early, if it did */
  stopped: null | 'offline' | 'session' | 'forbidden';
  message: string | null;
}

const EMPTY: SyncReport = {
  synced: 0,
  rejected: 0,
  retrying: 0,
  masterData: false,
  stopped: null,
  message: null,
};

/**
 * Offline-first synchronisation for one signed-in booker (D-46).
 *
 * - Orders are saved on the phone first (PENDING_SYNC) and sent here one by one, oldest first,
 *   with their clientOrderId — a resend after a lost reply returns the same server order.
 * - Only one run at a time (concurrent calls share it), so an order is never sent twice in
 *   parallel from this phone.
 * - No connection → the order simply stays PENDING_SYNC; server trouble (5xx) → FAILED + retried
 *   with backoff; a refusal (400 / 409 / 422) → FAILED with a reason, never retried by itself;
 *   an ended session → orders wait, untouched, until the booker signs in again.
 * - Master data (shops, areas, products) is replaced from the server on every online run.
 */
export class SyncService {
  private running: Promise<SyncReport> | null = null;

  constructor(
    private readonly db: LocalDb,
    private readonly api: ApiClient,
    private readonly owner: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Orders left SYNCING by a closed app go back to the queue (safe thanks to clientOrderId). */
  recover(): Promise<void> {
    return resetStuckSyncing(this.db, this.owner);
  }

  /** Full run: send pending orders, then refresh master data and order history. */
  syncAll(): Promise<SyncReport> {
    return this.single(async () => {
      const report = await this.sendOrders();
      if (report.stopped) return report;
      try {
        await this.refreshMasterData();
        await this.refreshHistory();
        return { ...report, masterData: true };
      } catch (error) {
        return { ...report, ...stopFor(error) };
      }
    });
  }

  /** Orders only (after booking one, or when the connection comes back). */
  syncOrders(): Promise<SyncReport> {
    return this.single(() => this.sendOrders());
  }

  lastSync(): Promise<number | null> {
    return getMeta(this.db, this.owner, 'last_sync').then((v) => (v ? Number(v) : null));
  }

  private single(task: () => Promise<SyncReport>): Promise<SyncReport> {
    this.running ??= task().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async sendOrders(): Promise<SyncReport> {
    const report = { ...EMPTY };
    const queue = await ordersToSync(this.db, this.owner, this.now());
    for (const order of queue) {
      await markSyncing(this.db, order.localId, this.now());
      try {
        const created = await this.api.createOrder({
          clientOrderId: order.localId,
          shopId: order.shopId,
          items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          notes: order.notes ?? undefined,
        });
        await markSynced(
          this.db,
          order.localId,
          { id: created.id, orderNumber: created.orderNumber, status: created.status },
          this.now(),
        );
        report.synced++;
      } catch (error) {
        if (error instanceof ApiError && !isTemporary(error) && isRejection(error)) {
          await markFailed(
            this.db,
            order.localId,
            { message: explainRejection(order, error), retryable: false, nextAttemptAt: null },
            this.now(),
          );
          report.rejected++;
          continue;
        }
        if (error instanceof ApiError && isTemporary(error)) {
          await markFailed(
            this.db,
            order.localId,
            {
              message: 'The server had a problem. Will try again automatically.',
              retryable: true,
              nextAttemptAt: this.now() + backoffMs(order.attempts + 1),
            },
            this.now(),
          );
          report.retrying++;
          continue;
        }
        // offline, session ended, or access refused: the order is fine — leave it queued
        await markPending(this.db, order.localId, this.now());
        return { ...report, ...stopFor(error) };
      }
    }
    if (report.synced > 0) await setMeta(this.db, this.owner, 'last_sync', String(this.now()));
    return report;
  }

  private async refreshMasterData(): Promise<void> {
    const shops = await allPages((p) => this.api.shopsPage(p));
    const products = await allPages((p) => this.api.productsPage(p));
    const areas = await this.api.areas();
    const now = this.now();
    await replaceMasterData(
      this.db,
      this.owner,
      {
        shops: shops.map((s) => ({
          id: s.id,
          name: s.name,
          contactPerson: s.contactPerson,
          phone: s.phone,
          address: s.address,
          areaId: s.area.id,
          areaName: s.area.name,
        })),
        areas: areas.map((a) => ({ id: a.id, name: a.name, shopCount: a.shopCount })),
        products: products.map((p): LocalProduct => ({
          id: p.id,
          name: p.name,
          code: p.code,
          type: p.type,
          piecesPerCarton: p.piecesPerCarton,
        })),
      },
      now,
    );
    await setMeta(this.db, this.owner, 'last_sync', String(now));
  }

  /** My recent server orders (up to 300) for My Orders while offline. */
  private async refreshHistory(): Promise<void> {
    const orders = await allPages((p) => this.api.ordersPage(p), 3);
    await replaceServerOrders(
      this.db,
      this.owner,
      orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        clientOrderId: o.clientOrderId,
        shopName: o.shop.name,
        areaName: o.area.name,
        status: o.status,
        itemCount: o.itemCount,
        totalPieces: o.totalPieces,
        totalCartons: o.totalCartons,
        createdAt: o.createdAt,
      })),
    );
  }
}

function isRejection(error: ApiError): boolean {
  return (
    error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422
  );
}

function stopFor(error: unknown): Pick<SyncReport, 'stopped' | 'message'> {
  if (error instanceof NetworkError) return { stopped: 'offline', message: null };
  if (error instanceof SessionEndedError) return { stopped: 'session', message: error.message };
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return { stopped: 'forbidden', message: error.message };
  }
  if (error instanceof ApiError) return { stopped: 'offline', message: error.message };
  throw error;
}

async function allPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; total: number; pageSize: number }>,
  maxPages = 50,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetchPage(page);
    items.push(...res.items);
    if (page * res.pageSize >= res.total || res.items.length === 0) break;
  }
  return items;
}
