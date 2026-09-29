import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'mt_refresh';
/** Cookie is only sent to the auth endpoints (global prefix /api). */
export const REFRESH_COOKIE_PATH = '/api/auth';

function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: REFRESH_COOKIE_PATH };
}

export function setRefreshCookie(
  res: Response,
  raw: string,
  expiresAt: Date,
  secure: boolean,
): void {
  res.cookie(REFRESH_COOKIE_NAME, raw, { ...baseOptions(secure), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions(secure));
}
