import {
  type AuthUser,
  type BookerArea,
  type BookerProduct,
  type BookerShop,
  type CreateOrderInput,
  type MobileSessionResponse,
  type OrderDetails,
  type OrderSummary,
  type Paginated,
} from '@mytraders/shared-types';
import { type SecureKV } from '../auth/secure-kv';
import { ApiError, NetworkError, SessionEndedError } from './errors';

export const BOOKER_ONLY_MESSAGE =
  'This app is for Order Bookers only. Admins, please use the SupplyBeacon website.';

const KEY_REFRESH = 'sb.refreshToken';
const KEY_USER = 'sb.user';
const TIMEOUT_MS = 20_000;

export interface ApiClientOptions {
  baseUrl: string;
  store: SecureKV;
  fetch?: typeof fetch;
  /** called once when the session ends for good (reason shown on the sign-in screen) */
  onSessionEnded?: (reason: string) => void;
}

/**
 * Talks to the existing SupplyBeacon API. The access token lives only in memory; the refresh
 * token and the signed-in user live in SecureStore. A 401 triggers one refresh (shared by
 * concurrent requests) and a retry. The organization is never sent — the server takes it from
 * the token.
 */
export class ApiClient {
  private accessToken: string | null = null;
  private refreshing: Promise<void> | null = null;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    // never call the global fetch as a method of this object ("Illegal invocation" on web)
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  }

  // ---- session -------------------------------------------------------------------------------

  /** The user saved on this phone (works offline). null = must sign in. */
  async savedUser(): Promise<AuthUser | null> {
    const [raw, refresh] = await Promise.all([
      this.options.store.get(KEY_USER),
      this.options.store.get(KEY_REFRESH),
    ]);
    if (!raw || !refresh) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const res = await this.send('/auth/mobile/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!res.ok) throw await toApiError(res);
    const session = (await res.json()) as MobileSessionResponse;
    // the server already refuses other roles; never keep a non-booker session regardless
    if (session.user.role !== 'ORDER_BOOKER') throw new ApiError(403, BOOKER_ONLY_MESSAGE);
    await this.keep(session);
    return session.user;
  }

  /** Revokes the refresh token when online (best effort) and forgets the session. */
  async logout(): Promise<void> {
    const refreshToken = await this.options.store.get(KEY_REFRESH);
    this.accessToken = null;
    await Promise.all([
      this.options.store.delete(KEY_REFRESH),
      this.options.store.delete(KEY_USER),
    ]);
    if (refreshToken) {
      await this.send('/auth/mobile/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
  }

  // ---- booker data ---------------------------------------------------------------------------

  me() {
    return this.get<AuthUser>('/auth/me');
  }
  shopsPage(page: number) {
    return this.get<Paginated<BookerShop>>(`/booker/shops?page=${page}&pageSize=100`);
  }
  areas() {
    return this.get<BookerArea[]>('/booker/areas');
  }
  productsPage(page: number) {
    return this.get<Paginated<BookerProduct>>(`/booker/products?page=${page}&pageSize=100`);
  }
  ordersPage(page: number) {
    return this.get<Paginated<OrderSummary>>(`/orders?page=${page}&pageSize=100`);
  }
  /** Idempotent with `clientOrderId`: a resend returns the order already created for it. */
  createOrder(body: CreateOrderInput) {
    return this.request<OrderDetails>('/orders', { method: 'POST', body: JSON.stringify(body) });
  }

  // ---- plumbing ------------------------------------------------------------------------------

  private get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.accessToken) await this.refresh();
    let res = await this.send(path, init, this.accessToken);
    if (res.status === 401) {
      await this.refresh();
      res = await this.send(path, init, this.accessToken);
    }
    if (!res.ok) throw await toApiError(res);
    return (await res.json()) as T;
  }

  /** One refresh at a time; concurrent callers wait for the same one. */
  private refresh(): Promise<void> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<void> {
    const refreshToken = await this.options.store.get(KEY_REFRESH);
    if (!refreshToken) throw this.endSession('Please sign in');
    const res = await this.send('/auth/mobile/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    if (res.status === 401 || res.status === 403) {
      const error = await toApiError(res);
      await Promise.all([
        this.options.store.delete(KEY_REFRESH),
        this.options.store.delete(KEY_USER),
      ]);
      throw this.endSession(error.message || 'Session expired, please sign in again');
    }
    if (!res.ok) throw await toApiError(res);
    await this.keep((await res.json()) as MobileSessionResponse);
  }

  private endSession(reason: string): SessionEndedError {
    this.accessToken = null;
    this.options.onSessionEnded?.(reason);
    return new SessionEndedError(reason);
  }

  private async keep(session: MobileSessionResponse) {
    this.accessToken = session.accessToken;
    await Promise.all([
      this.options.store.set(KEY_REFRESH, session.refreshToken),
      this.options.store.set(KEY_USER, JSON.stringify(session.user)),
    ]);
  }

  private async send(path: string, init: RequestInit, token?: string | null): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await this.fetchFn(`${this.options.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let details: { path: string; message: string }[] = [];
  try {
    const body = (await res.json()) as {
      message?: string | string[];
      details?: { path: string; message: string }[];
    };
    if (Array.isArray(body.message)) message = body.message.join('. ');
    else if (body.message) message = body.message;
    details = body.details ?? [];
  } catch {
    // not JSON (proxy / gateway page) — keep the generic message
  }
  return new ApiError(res.status, message, details);
}
