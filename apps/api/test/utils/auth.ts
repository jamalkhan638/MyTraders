import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TEST_PASSWORD } from './factories';

export interface LoggedIn {
  accessToken: string;
  /** "mt_refresh=<value>" ready to send as a Cookie header */
  refreshCookie: string;
}

export function extractRefreshCookie(setCookie: string | string[] | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = cookies.find((c) => c.startsWith('mt_refresh='));
  return cookie?.split(';')[0];
}

export async function login(
  app: INestApplication,
  email: string,
  password = TEST_PASSWORD,
): Promise<LoggedIn> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  const refreshCookie = extractRefreshCookie(res.headers['set-cookie']);
  if (!refreshCookie) throw new Error('login did not set a refresh cookie');
  return { accessToken: res.body.accessToken as string, refreshCookie };
}
