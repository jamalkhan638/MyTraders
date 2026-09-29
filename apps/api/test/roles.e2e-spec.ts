import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

describe('Role authorization (e2e)', () => {
  let t: TestApp;
  const tokens: Record<'admin' | 'booker' | 'superAdmin', string> = {
    admin: '',
    booker: '',
    superAdmin: '',
  };

  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const org = await createOrganization(t.prisma);
    const admin = await createUser(t.prisma, { organizationId: org.id, role: 'ADMIN' });
    const booker = await createUser(t.prisma, { organizationId: org.id, role: 'ORDER_BOOKER' });
    const superAdmin = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });
    tokens.admin = (await login(t.app, admin.email)).accessToken;
    tokens.booker = (await login(t.app, booker.email)).accessToken;
    tokens.superAdmin = (await login(t.app, superAdmin.email)).accessToken;
  });

  afterAll(() => t.close());

  it.each([
    ['admin', 'ADMIN'],
    ['booker', 'ORDER_BOOKER'],
    ['superAdmin', 'SUPER_ADMIN'],
  ] as const)('%s can read its own profile with role %s', async (who, role) => {
    const res = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens[who]}`)
      .expect(200);
    expect(res.body.role).toBe(role);
  });

  it('SUPER_ADMIN has no organization', async () => {
    const res = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.superAdmin}`)
      .expect(200);
    expect(res.body.organization).toBeNull();
  });

  it('ADMIN can access Admin-only routes', async () => {
    await http().get('/api/users').set('Authorization', `Bearer ${tokens.admin}`).expect(200);
  });

  it('ORDER_BOOKER is forbidden from Admin-only routes', async () => {
    const res = await http()
      .get('/api/users')
      .set('Authorization', `Bearer ${tokens.booker}`)
      .expect(403);
    expect(res.body).toMatchObject({ statusCode: 403, error: 'Forbidden' });
  });

  it('SUPER_ADMIN is forbidden from organization (tenant) routes', async () => {
    await http().get('/api/users').set('Authorization', `Bearer ${tokens.superAdmin}`).expect(403);
  });

  it('unauthenticated requests get 401 before any role check', async () => {
    await http().get('/api/users').expect(401);
  });

  it('public routes need no token', async () => {
    await http().get('/api/health').expect(200);
  });

  it('unknown routes return the standard error body', async () => {
    const res = await http()
      .get('/api/does-not-exist')
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });
});
