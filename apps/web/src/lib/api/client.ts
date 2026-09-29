import { type ApiErrorBody, type AuthSessionResponse } from '@mytraders/shared-types';
import { tokenStore } from '@/lib/auth/token-store';

const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | undefined;

  constructor(status: number, body: ApiErrorBody | undefined) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

type SessionListener = (session: AuthSessionResponse | null) => void;
const sessionListeners = new Set<SessionListener>();

/** AuthProvider subscribes here to learn about refreshed or expired sessions. */
export function onSessionChange(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function emitSession(session: AuthSessionResponse | null) {
  sessionListeners.forEach((listener) => listener(session));
}

let refreshInFlight: Promise<AuthSessionResponse | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Single-flight inside a tab, and
 * serialized across tabs with the Web Locks API: a rotated refresh token must never be
 * sent twice (the server treats reuse as theft and ends the session).
 */
export function refreshSession(): Promise<AuthSessionResponse | null> {
  refreshInFlight ??= withCrossTabLock(async () => {
    const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) {
      tokenStore.clear();
      emitSession(null);
      return null;
    }
    const session = (await res.json()) as AuthSessionResponse;
    tokenStore.set(session.accessToken);
    emitSession(session);
    return session;
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('mytraders-auth-refresh', fn) as Promise<T>;
  }
  return fn();
}

export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  json?: unknown;
}

/**
 * fetch wrapper: adds the access token, sends cookies, parses JSON, and on 401 refreshes the
 * session once and retries. Non-2xx responses throw ApiError with the server's error body.
 */
export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const send = () => {
    const token = tokenStore.get();
    return fetch(`${API_BASE}${path}`, {
      ...rest,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  };

  let res = await send();
  if (res.status === 401 && tokenStore.get() && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) res = await send();
  }

  if (!res.ok) throw new ApiError(res.status, await readErrorBody(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function readErrorBody(res: Response): Promise<ApiErrorBody | undefined> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    return undefined;
  }
}
