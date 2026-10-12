import { type SecureKV } from './secure-kv';

/**
 * Browser preview only (screenshots / quick UI checks): expo-secure-store has no web version, so
 * the preview keeps the session in localStorage. The Android app uses secure-kv.ts (Keystore).
 */
export const secureStoreKV: SecureKV = {
  get: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  set: async (key, value) => globalThis.localStorage?.setItem(key, value),
  delete: async (key) => globalThis.localStorage?.removeItem(key),
};
export type { SecureKV };
