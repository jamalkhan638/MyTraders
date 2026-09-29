import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { extractRefreshCookie, login } from './utils/auth';
import { createOrganization, createUser, TEST_PASSWORD } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

describe('Authentication (e2e)', () => {
  let t: TestApp;
  let orgId: string;
  let adminEmail: string;

  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const org = await createOrganization(t.prisma, { name: 'Auth Org' });
    orgId = org.id;
    adminEmail = (
      await createUser(t.prisma, {
        organizationId: org.id,
        role: 'ADMIN',
        email: 'admin@auth.test',
      })
    ).email;
  });

  afterAll(() => t.close());

  describe('POST /api/auth/login', () => {
    it('returns an access token, the user and an httpOnly refresh cookie', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ email: adminEmail, password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.user).toMatchObject({
        email: adminEmail,
        role: 'ADMIN',
        organization: { id: orgId, name: 'Auth Org', status: 'ACTIVE', currency: 'PKR' },
      });
      expect(res.body.user.passwordHash).toBeUndefined();

      const setCookie = ([] as string[])
        .concat(res.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('mt_refresh='));
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Path=/api/auth');
    });

    it('stores only a hash of the refresh token', async () => {
      const { refreshCookie } = await login(t.app, adminEmail);
      const raw = refreshCookie.split('=')[1];
      expect(await t.prisma.refreshToken.count({ where: { tokenHash: raw } })).toBe(0);
    });

    it('treats the email case-insensitively', async () => {
      await http()
        .post('/api/auth/login')
        .send({ email: '  ADMIN@Auth.Test ', password: TEST_PASSWORD })
        .expect(200);
    });

    it('rejects a wrong password and an unknown email with the same message', async () => {
      const wrong = await http()
        .post('/api/auth/login')
        .send({ email: adminEmail, password: 'nope' })
        .expect(401);
      const unknown = await http()
        .post('/api/auth/login')
        .send({ email: 'nobody@auth.test', password: 'nope' })
        .expect(401);
      expect(wrong.body.message).toBe('Invalid email or password');
      expect(unknown.body).toEqual(wrong.body);
    });

    it('validates the request body', async () => {
      const res = await http().post('/api/auth/login').send({ email: 'not-an-email' }).expect(400);
      expect(res.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
      });
      expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'email',
        'password',
      ]);
    });

    it('rejects an inactive user', async () => {
      const user = await createUser(t.prisma, {
        organizationId: orgId,
        role: 'ORDER_BOOKER',
        isActive: false,
      });
      const res = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(401);
      expect(res.body.message).toBe('Your account is inactive');
    });

    it('rejects a user of a suspended organization', async () => {
      const suspended = await createOrganization(t.prisma, { status: 'SUSPENDED' });
      const user = await createUser(t.prisma, { organizationId: suspended.id, role: 'ADMIN' });
      const res = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(401);
      expect(res.body.message).toBe('Your organization is suspended');
    });
  });

  describe('access token', () => {
    it('is required for protected routes', async () => {
      await http().get('/api/auth/me').expect(401);
      await http().get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    });

    it('returns the current user on /api/auth/me', async () => {
      const { accessToken } = await login(t.app, adminEmail);
      const res = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        email: adminEmail,
        role: 'ADMIN',
        organization: { id: orgId },
      });
    });

    it('rejects an expired token', async () => {
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
      const expired = await t.app
        .get(JwtService)
        .signAsync({ sub: user.id, org: user.organizationId, role: user.role }, { expiresIn: -10 });
      await http().get('/api/auth/me').set('Authorization', `Bearer ${expired}`).expect(401);
    });

    it('rejects a token signed with another secret', async () => {
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
      const forged = await new JwtService({ secret: 'x'.repeat(40) }).signAsync(
        { sub: user.id, org: user.organizationId, role: 'ADMIN' },
        { issuer: 'mytraders-api' },
      );
      await http().get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('stops working as soon as the user is deactivated', async () => {
      const user = await createUser(t.prisma, { organizationId: orgId, role: 'ORDER_BOOKER' });
      const { accessToken } = await login(t.app, user.email);
      await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      await http().get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    });

    it('stops working as soon as the organization is suspended', async () => {
      const org = await createOrganization(t.prisma);
      const user = await createUser(t.prisma, { organizationId: org.id, role: 'ADMIN' });
      const { accessToken } = await login(t.app, user.email);
      await t.prisma.organization.update({ where: { id: org.id }, data: { status: 'SUSPENDED' } });
      await http().get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    });

    it('stops working when the user role changes', async () => {
      const user = await createUser(t.prisma, { organizationId: orgId, role: 'ADMIN' });
      const { accessToken } = await login(t.app, user.email);
      await t.prisma.user.update({ where: { id: user.id }, data: { role: 'ORDER_BOOKER' } });
      await http().get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('requires the refresh cookie', async () => {
      await http().post('/api/auth/refresh').expect(401);
    });

    it('rotates the refresh token and issues a new access token', async () => {
      const first = await login(t.app, adminEmail);
      const res = await http()
        .post('/api/auth/refresh')
        .set('Cookie', first.refreshCookie)
        .expect(200);
      const rotated = extractRefreshCookie(res.headers['set-cookie']);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user.email).toBe(adminEmail);
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(first.refreshCookie);
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('revokes the whole session when an old refresh token is reused', async () => {
      const first = await login(t.app, adminEmail);
      const res = await http()
        .post('/api/auth/refresh')
        .set('Cookie', first.refreshCookie)
        .expect(200);
      const rotated = extractRefreshCookie(res.headers['set-cookie'])!;

      // Reusing the already-rotated token is treated as theft...
      await http().post('/api/auth/refresh').set('Cookie', first.refreshCookie).expect(401);
      // ...so even the latest token of that session no longer works.
      await http().post('/api/auth/refresh').set('Cookie', rotated).expect(401);
    });

    it('fails for a user deactivated after login', async () => {
      const user = await createUser(t.prisma, { organizationId: orgId, role: 'ORDER_BOOKER' });
      const { refreshCookie } = await login(t.app, user.email);
      await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      await http().post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
    });

    it('fails for an expired refresh token', async () => {
      const { refreshCookie } = await login(t.app, adminEmail);
      await t.prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await http().post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('revokes the refresh token and clears the cookie', async () => {
      const { refreshCookie } = await login(t.app, adminEmail);
      const res = await http().post('/api/auth/logout').set('Cookie', refreshCookie).expect(204);
      expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';')).toMatch(
        /mt_refresh=;/,
      );
      await http().post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
    });

    it('succeeds without a cookie', async () => {
      await http().post('/api/auth/logout').expect(204);
    });
  });
});
