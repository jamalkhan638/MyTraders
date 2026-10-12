import { type SyncReport, type SyncService } from './sync-service';

export type SyncNotice =
  | { kind: 'info'; text: string }
  | { kind: 'success'; text: string }
  | { kind: 'warning'; text: string }
  | { kind: 'session-ended'; text: string };

export const OFFLINE_TEXT = 'You are offline. Orders will be saved and synced automatically.';
export const BACK_ONLINE_TEXT = 'Back online. Syncing pending orders...';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Decides WHEN to sync (the SyncService decides HOW): when the connection comes back, right after
 * an order is saved, on "Sync now", and on a timer for due retries. Pure logic — the app feeds it
 * connectivity from NetInfo; tests feed it directly.
 */
export class SyncController {
  private online: boolean | null = null;

  constructor(
    private readonly service: SyncService,
    private readonly notify: (notice: SyncNotice) => void,
  ) {}

  get isOnline(): boolean {
    return this.online === true;
  }

  /** NetInfo said the connection changed. Coming back online sends everything waiting. */
  async connectivityChanged(isOnline: boolean): Promise<SyncReport | null> {
    const cameBack = isOnline && this.online === false;
    const first = this.online === null;
    this.online = isOnline;
    if (!isOnline) return null;
    if (cameBack) this.notify({ kind: 'info', text: BACK_ONLINE_TEXT });
    if (cameBack || first) return this.run(() => this.service.syncAll(), cameBack);
    return null;
  }

  /** An order was just saved on the phone: send it now if there is a connection. */
  async orderSaved(): Promise<SyncReport | null> {
    if (!this.isOnline) return null;
    return this.run(() => this.service.syncOrders(), false);
  }

  /** "Sync now" (pull-to-refresh, Profile, My Orders). */
  async syncNow(): Promise<SyncReport | null> {
    if (!this.isOnline) {
      this.notify({ kind: 'warning', text: OFFLINE_TEXT });
      return null;
    }
    return this.run(() => this.service.syncAll(), true);
  }

  /** Timer tick while the app is open: retries whose wait has passed. */
  async tick(): Promise<SyncReport | null> {
    if (!this.isOnline) return null;
    return this.run(() => this.service.syncOrders(), false);
  }

  private async run(task: () => Promise<SyncReport>, announceNothing: boolean) {
    const report = await task();
    this.report(report, announceNothing);
    return report;
  }

  private report(r: SyncReport, announceNothing: boolean) {
    if (r.stopped === 'session') {
      this.notify({ kind: 'session-ended', text: r.message ?? 'Please sign in again.' });
      return;
    }
    if (r.stopped === 'forbidden') {
      this.notify({
        kind: 'warning',
        text: r.message ?? 'Access refused. Please contact your office.',
      });
      return;
    }
    if (r.synced > 0) {
      this.notify({ kind: 'success', text: `${plural(r.synced, 'order')} synced successfully.` });
    }
    if (r.rejected > 0) {
      this.notify({
        kind: 'warning',
        text: `${plural(r.rejected, 'order')} could not be sent — open My Orders to fix.`,
      });
    }
    if (r.synced === 0 && r.rejected === 0 && announceNothing && !r.stopped) {
      this.notify({ kind: 'info', text: 'Everything is up to date.' });
    }
    if (r.stopped === 'offline' && announceNothing) {
      this.notify({ kind: 'warning', text: OFFLINE_TEXT });
    }
  }
}
