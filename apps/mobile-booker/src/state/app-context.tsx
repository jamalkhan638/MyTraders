import NetInfo from '@react-native-community/netinfo';
import { type AuthUser } from '@mytraders/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { ApiClient } from '../api/client';
import { secureStoreKV } from '../auth/secure-kv';
import { API_URL } from '../config';
import { openLocalDb } from '../db/expo-db';
import { clearOwnerCache } from '../db/repo';
import { type LocalDb } from '../db/sql';
import { type SyncNotice, SyncController } from '../sync/controller';
import { SyncService } from '../sync/sync-service';

interface AppContextValue {
  ready: boolean;
  db: LocalDb | null;
  api: ApiClient;
  user: AuthUser | null;
  /** why the last session ended (shown on the sign-in screen) */
  signedOutReason: string | null;
  online: boolean;
  syncing: boolean;
  lastSync: number | null;
  notice: SyncNotice | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  syncNow(): Promise<void>;
  orderSaved(): Promise<boolean>;
  dismissNotice(): void;
}

const Ctx = createContext<AppContextValue | null>(null);
const RETRY_TICK_MS = 60_000;
const OFFLINE_RECHECK_MS = 15_000;

/**
 * App-wide state: local database, session (SecureStore), connectivity (NetInfo) and the sync
 * engine of the signed-in booker. Local data is read with TanStack Query (keys under 'local');
 * every sync invalidates them so screens show fresh data.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [db, setDb] = useState<LocalDb | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [signedOutReason, setSignedOutReason] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [notice, setNotice] = useState<SyncNotice | null>(null);
  const showNotice = useCallback((n: SyncNotice) => setNotice(n), []);

  // notices disappear by themselves (warnings stay a little longer)
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.kind === 'warning' ? 7000 : 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const api = useMemo(
    () =>
      new ApiClient({
        baseUrl: API_URL,
        store: secureStoreKV,
        onSessionEnded: (reason) => {
          setSignedOutReason(reason);
          setUser(null);
        },
      }),
    [],
  );

  // open the database and restore a saved session (works offline)
  useEffect(() => {
    void (async () => {
      const opened = await openLocalDb();
      setDb(opened);
      setUser(await api.savedUser());
      setReady(true);
    })();
  }, [api]);

  const sync = useMemo(() => {
    if (!db || !user) return null;
    const service = new SyncService(db, api, user.id);
    const controller = new SyncController(service, (n) => {
      if (n.kind === 'session-ended') {
        setSignedOutReason(n.text);
        setUser(null);
      }
      showNotice(n);
    });
    return { service, controller };
  }, [db, user, api, showNotice]);

  const afterRun = useCallback(async () => {
    if (!sync) return;
    setLastSync(await sync.service.lastSync());
    await queryClient.invalidateQueries({ queryKey: ['local'] });
  }, [sync, queryClient]);

  const run = useCallback(
    async (task: () => Promise<unknown>) => {
      setSyncing(true);
      try {
        await task();
      } finally {
        setSyncing(false);
        await afterRun();
      }
    },
    [afterRun],
  );

  // connectivity, app foreground and a timer for due retries
  useEffect(() => {
    if (!sync) return;
    void sync.service.recover().then(afterRun);
    // "online" = our API answers, not just "has Wi-Fi": probe the API's own health endpoint
    NetInfo.configure({
      reachabilityUrl: `${API_URL}/health`,
      reachabilityTest: async (response) => response.status === 200,
      reachabilityShortTimeout: 5_000,
      reachabilityLongTimeout: 60_000,
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      setOnline(isOnline);
      void run(() => sync.controller.connectivityChanged(isOnline));
    });
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void run(() => sync.controller.tick());
    });
    const timer = setInterval(() => void run(() => sync.controller.tick()), RETRY_TICK_MS);
    // safety net for missed connectivity events: re-check while we believe we are offline
    const recheck = setInterval(() => {
      if (!sync.controller.isOnline) void NetInfo.refresh();
    }, OFFLINE_RECHECK_MS);
    // browser preview: Chrome's NetInfo listens to navigator.connection only
    const onBrowserChange = () => void NetInfo.refresh();
    if (Platform.OS === 'web') {
      globalThis.addEventListener?.('online', onBrowserChange);
      globalThis.addEventListener?.('offline', onBrowserChange);
    }
    return () => {
      unsubscribe();
      appState.remove();
      clearInterval(timer);
      clearInterval(recheck);
      if (Platform.OS === 'web') {
        globalThis.removeEventListener?.('online', onBrowserChange);
        globalThis.removeEventListener?.('offline', onBrowserChange);
      }
    };
  }, [sync, run, afterRun]);

  const value: AppContextValue = {
    ready,
    db,
    api,
    user,
    signedOutReason,
    online,
    syncing,
    lastSync,
    notice,
    signIn: async (email, password) => {
      const signed = await api.login(email, password);
      setSignedOutReason(null);
      setUser(signed);
    },
    signOut: async () => {
      if (db && user) await clearOwnerCache(db, user.id);
      await api.logout();
      queryClient.clear();
      setUser(null);
      setLastSync(null);
    },
    syncNow: async () => {
      if (sync) await run(() => sync.controller.syncNow());
    },
    orderSaved: async () => {
      await queryClient.invalidateQueries({ queryKey: ['local'] });
      if (!sync || !sync.controller.isOnline) return false;
      await run(() => sync.controller.orderSaved());
      return true;
    },
    dismissNotice: () => setNotice(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp outside AppProvider');
  return ctx;
}

/** The signed-in booker and the database (screens inside the signed-in area only). */
export function useSession() {
  const app = useApp();
  if (!app.user || !app.db) throw new Error('Not signed in');
  return { ...app, user: app.user, db: app.db, owner: app.user.id };
}
