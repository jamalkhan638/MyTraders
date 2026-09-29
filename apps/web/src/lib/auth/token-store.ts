/**
 * Access token kept in memory only (never localStorage) — docs/architecture.md §4.
 * After a page reload the session is restored with the httpOnly refresh cookie.
 */
let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  },
};
