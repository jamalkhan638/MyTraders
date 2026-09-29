import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

describe('Users / Order Booker management (e2e)', () => {
  let t: TestApp;
  let orgA: { id: string };
  let orgB: { id: string };
  let adminAUser: { id: string };
  let bookerBUser: { id: string; name: string };
  let adminA: string;
  let adminB: string;
  let bookerA: string;
  let superAdmin: string;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createBooker = (token: string, body: object) =>
    http().post('/api/users').set(auth(token)).send(body);
  const updateUser = (token: string, id: string, body: object) =>
    http().patch(`/api/users/${id}`).set(auth(token)).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    adminAUser = await createUser(t.prisma, {
      organizationId: orgA.id,
      role: 'ADMIN',
      name: 'Admin A',
    });
    const adminBUser = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const bookerAUser = await createUser(t.prisma, {
      organizationId: orgA.id,
      role: 'ORDER_BOOKER',
    });
    bookerBUser = await createUser(t.prisma, {
      organizationId: orgB.id,
      role: 'ORDER_BOOKER',
      name: 'Booker B',
    });
    const superUser = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });
    adminA = (
      await login(
        t.app,
        (await t.prisma.user.findUniqueOrThrow({ where: { id: adminAUser.id } })).email,
      )
    ).accessToken;
    adminB = (await login(t.app, adminBUser.email)).accessToken;
    bookerA = (await login(t.app, bookerAUser.email)).accessToken;
    superAdmin = (await login(t.app, superUser.email)).accessToken;
  });

  afterAll(() => t.close());

  describe('create Order Booker', () => {
    it('creates an ORDER_BOOKER in the Admin organization who can then sign in', async () => {
      const res = await createBooker(adminA, {
        name: 'Ahmed Khan',
        email: 'Ahmed@Example.com',
        phone: '0300 1234567',
        password: 'Booker@123',
      }).expect(201);

      expect(res.body).toMatchObject({
        name: 'Ahmed Khan',
        email: 'ahmed@example.com',
        phone: '0300 1234567',
        role: 'ORDER_BOOKER',
        isActive: true,
      });
      expect(res.body.passwordHash).toBeUndefined();
      const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.organizationId).toBe(orgA.id);

      const session = await http()
        .post('/api/auth/login')
        .send({ email: 'ahmed@example.com', password: 'Booker@123' })
        .expect(200);
      expect(session.body.user).toMatchObject({
        role: 'ORDER_BOOKER',
        organization: { id: orgA.id },
      });
    });

    it('ignores role and organization sent by the client', async () => {
      const res = await createBooker(adminA, {
        name: 'Sneaky',
        email: 'sneaky@example.com',
        password: 'Booker@123',
        role: 'ADMIN',
        organizationId: orgB.id,
      }).expect(201);
      expect(res.body.role).toBe('ORDER_BOOKER');
      const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.organizationId).toBe(orgA.id);
    });

    it('rejects a duplicate email (emails are unique across the platform)', async () => {
      const res = await createBooker(adminB, {
        name: 'Dup',
        email: 'AHMED@example.com',
        password: 'Booker@123',
      }).expect(409);
      expect(res.body.message).toBe('This email is already in use');
    });

    it('validates input', async () => {
      const res = await createBooker(adminA, { name: '', email: 'nope', password: 'short' }).expect(
        400,
      );
      expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'email',
        'name',
        'password',
      ]);
    });
  });

  describe('list', () => {
    it('lists organization users with pagination and filters', async () => {
      const all = await http().get('/api/users').set(auth(adminA)).expect(200);
      expect(all.body).toMatchObject({ page: 1, pageSize: 20 });
      expect(all.body.total).toBe(all.body.items.length);

      const bookers = await http()
        .get('/api/users?role=ORDER_BOOKER')
        .set(auth(adminA))
        .expect(200);
      expect(bookers.body.items.every((u: { role: string }) => u.role === 'ORDER_BOOKER')).toBe(
        true,
      );

      const search = await http().get('/api/users?q=ahmed').set(auth(adminA)).expect(200);
      expect(search.body.items.map((u: { email: string }) => u.email)).toEqual([
        'ahmed@example.com',
      ]);

      const page = await http().get('/api/users?pageSize=1&page=2').set(auth(adminA)).expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.total).toBe(all.body.total);
    });

    it('rejects invalid query parameters', async () => {
      await http().get('/api/users?pageSize=1000').set(auth(adminA)).expect(400);
      await http().get('/api/users?role=OWNER').set(auth(adminA)).expect(400);
    });
  });

  describe('edit / activate / deactivate', () => {
    let bookerId: string;
    const email = 'edit-me@example.com';

    beforeAll(async () => {
      const res = await createBooker(adminA, {
        name: 'Edit Me',
        email,
        password: 'Booker@123',
      }).expect(201);
      bookerId = res.body.id;
    });

    it('edits name, email and phone', async () => {
      const res = await updateUser(adminA, bookerId, {
        name: 'Edited',
        phone: '0311',
        email: 'EDITED@example.com',
      }).expect(200);
      expect(res.body).toMatchObject({
        name: 'Edited',
        phone: '0311',
        email: 'edited@example.com',
      });
      await updateUser(adminA, bookerId, { email }).expect(200);
    });

    it('deactivation blocks login and ends existing sessions; activation restores login', async () => {
      const session = await login(t.app, email, 'Booker@123');

      const res = await updateUser(adminA, bookerId, { isActive: false }).expect(200);
      expect(res.body.isActive).toBe(false);
      await http().get('/api/auth/me').set(auth(session.accessToken)).expect(401);
      await http().post('/api/auth/refresh').set('Cookie', session.refreshCookie).expect(401);
      await http().post('/api/auth/login').send({ email, password: 'Booker@123' }).expect(401);

      await updateUser(adminA, bookerId, { isActive: true }).expect(200);
      await http().post('/api/auth/login').send({ email, password: 'Booker@123' }).expect(200);
    });

    it('password reset replaces the password and ends existing sessions', async () => {
      const session = await login(t.app, email, 'Booker@123');
      await updateUser(adminA, bookerId, { password: 'NewPass@456' }).expect(200);

      await http().post('/api/auth/refresh').set('Cookie', session.refreshCookie).expect(401);
      await http().post('/api/auth/login').send({ email, password: 'Booker@123' }).expect(401);
      await http().post('/api/auth/login').send({ email, password: 'NewPass@456' }).expect(200);
    });

    it('cannot edit Admin accounts through this endpoint', async () => {
      const res = await updateUser(adminA, adminAUser.id, { isActive: false }).expect(403);
      expect(res.body.message).toBe('Only Order Booker accounts can be edited here');
      expect(
        (await t.prisma.user.findUniqueOrThrow({ where: { id: adminAUser.id } })).isActive,
      ).toBe(true);
    });

    it('rejects an email already used by someone else', async () => {
      await updateUser(adminA, bookerId, { email: 'ahmed@example.com' }).expect(409);
    });
  });

  describe('authorization', () => {
    it('Order Booker cannot use any user-management endpoint', async () => {
      await http().get('/api/users').set(auth(bookerA)).expect(403);
      await http().get(`/api/users/${adminAUser.id}`).set(auth(bookerA)).expect(403);
      await createBooker(bookerA, {
        name: 'X',
        email: 'x@example.com',
        password: 'Booker@123',
      }).expect(403);
      await updateUser(bookerA, adminAUser.id, { name: 'X' }).expect(403);
    });

    it('Super Admin cannot use organization user-management endpoints', async () => {
      await http().get('/api/users').set(auth(superAdmin)).expect(403);
      await createBooker(superAdmin, {
        name: 'X',
        email: 'y@example.com',
        password: 'Booker@123',
      }).expect(403);
    });
  });

  describe('tenant isolation', () => {
    it('Org A Admin cannot read, edit or deactivate an Org B booker (404) and B is unchanged', async () => {
      await http().get(`/api/users/${bookerBUser.id}`).set(auth(adminA)).expect(404);
      await updateUser(adminA, bookerBUser.id, { name: 'Hacked', isActive: false }).expect(404);

      const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: bookerBUser.id } });
      expect(stored).toMatchObject({ name: 'Booker B', isActive: true, organizationId: orgB.id });
    });

    it('lists never include another organization users', async () => {
      const resB = await http().get('/api/users?pageSize=100').set(auth(adminB)).expect(200);
      const orgBIds = (await t.prisma.user.findMany({ where: { organizationId: orgB.id } }))
        .map((u) => u.id)
        .sort();
      expect(resB.body.items.map((u: { id: string }) => u.id).sort()).toEqual(orgBIds);
    });
  });
});
