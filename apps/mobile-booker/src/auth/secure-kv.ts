import * as SecureStore from 'expo-secure-store';

/** Tiny key/value contract for secrets, so session logic can be tested without a phone. */
export interface SecureKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Android Keystore-backed storage (expo-secure-store). Tokens never go to SQLite. */
export const secureStoreKV: SecureKV = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  delete: (key) => SecureStore.deleteItemAsync(key),
};
