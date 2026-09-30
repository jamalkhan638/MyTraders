import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

describe('Shop categories (e2e)', () => {
  let t: TestApp;
  let orgA: { id: string };
  let orgB: { id: string };
  let adminA: string;
  let adminB: string;
  let bookerA: string;
  let superAdmin: string;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token: string, query = '') =>
    http().get(`/api/shop-categories${query}`).set(auth(token));
  const create = (token: string, body: object) =>
    http().post('/api/shop-categories').set(auth(token)).send(body);
  const update = (token: string, id: string, body: object) =>
    http().patch(`/api/shop-categories/${id}`).set(auth(token)).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const tokenFor = async (
      organizationId: string | null,
      role: 'ADMIN' | 'ORDER_BOOKER' | 'SUPER_ADMIN',
    ) =>
      (await login(t.app, (await createUser(t.prisma, { organizationId, role })).email))
        .accessToken;
    adminA = await tokenFor(orgA.id, 'ADMIN');
    adminB = await tokenFor(orgB.id, 'ADMIN');
    bookerA = await tokenFor(orgA.id, 'ORDER_BOOKER');
    superAdmin = await tokenFor(null, 'SUPER_ADMIN');
  });

  afterAll(() => t.close());

  describe('create', () => {
    it('creates an active shop category in the Admin organization', async () => {
      const res = await create(adminA, { name: 'General Store' }).expect(201);
      expect(res.body).toMatchObject({ name: 'General Store', isActive: true });
      expect(res.body.createdAt).toEqual(expect.any(String));

      const stored = await t.prisma.shopCategory.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored).toMatchObject({ organizationId: orgA.id, nameNormalized: 'general store' });
    });

    it('cleans extra spaces from the name', async () => {
      const res = await create(adminA, { name: '  Mini    Mart ' }).expect(201);
      expect(res.body.name).toBe('Mini Mart');
    });

    it('ignores organizationId sent by the client', async () => {
      const res = await create(adminA, { name: 'Wholesale', organizationId: orgB.id }).expect(201);
      expect(
        (await t.prisma.shopCategory.findUniqueOrThrow({ where: { id: res.body.id } }))
          .organizationId,
      ).toBe(orgA.id);
    });

    it.each([
      [{}, 'Category name is required'],
      [{ name: '' }, 'Category name is required'],
      [{ name: '    ' }, 'Category name is required'],
      [{ name: 42 }, 'Category name is required'],
      [{ name: 'x'.repeat(101) }, 'Category name must be at most 100 characters'],
    ])('rejects invalid body %j', async (body, message) => {
      const res = await create(adminA, body).expect(400);
      expect(res.body.details).toEqual([{ path: 'name', message }]);
    });
  });

  describe('duplicate names', () => {
    it('rejects the same name in the same organization, ignoring case and spaces', async () => {
      for (const name of ['General Store', 'general store', '  GENERAL   STORE  ']) {
        const res = await create(adminA, { name }).expect(409);
        expect(res.body.message).toBe('A shop category with this name already exists');
      }
    });

    it('allows the same name in another organization', async () => {
      const res = await create(adminB, { name: 'General Store' }).expect(201);
      expect(res.body.name).toBe('General Store');
    });

    it('rejects renaming to a name already used in the organization', async () => {
      const supermarket = await create(adminA, { name: 'Supermarket' }).expect(201);
      await update(adminA, supermarket.body.id, { name: 'GENERAL STORE' }).expect(409);
      expect(
        (await t.prisma.shopCategory.findUniqueOrThrow({ where: { id: supermarket.body.id } }))
          .name,
      ).toBe('Supermarket');
    });

    it('allows changing only the capitalisation of its own name', async () => {
      const res = await create(adminA, { name: 'medical store' }).expect(201);
      const renamed = await update(adminA, res.body.id, { name: 'Medical Store' }).expect(200);
      expect(renamed.body.name).toBe('Medical Store');
    });
  });

  describe('edit / activate / deactivate', () => {
    let id: string;

    beforeAll(async () => {
      id = (await create(adminA, { name: 'Cash Mart' }).expect(201)).body.id;
    });

    it('renames a category', async () => {
      const res = await update(adminA, id, { name: 'Cash And Carry Mart' }).expect(200);
      expect(res.body).toMatchObject({ id, name: 'Cash And Carry Mart', isActive: true });
    });

    it('deactivates and activates a category', async () => {
      expect((await update(adminA, id, { isActive: false }).expect(200)).body.isActive).toBe(false);
      expect((await update(adminA, id, { isActive: true }).expect(200)).body.isActive).toBe(true);
    });

    it('validates the update body', async () => {
      const res = await update(adminA, id, { name: '', isActive: 'yes' }).expect(400);
      expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'isActive',
        'name',
      ]);
    });

    it('returns 404 for an unknown id and 400 for a malformed id', async () => {
      await update(adminA, '0199a000-0000-7000-8000-000000000000', { name: 'X' }).expect(404);
      await http().get('/api/shop-categories/not-a-uuid').set(auth(adminA)).expect(400);
    });
  });

  describe('list', () => {
    it('lists categories sorted by name with pagination info', async () => {
      const res = await list(adminA).expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 20 });
      const names = res.body.items.map((a: { name: string }) => a.name);
      expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
      expect(res.body.total).toBe(names.length);
    });

    it('searches by name (case-insensitive)', async () => {
      const res = await list(adminA, '?q=MART').expect(200);
      expect(res.body.items.map((a: { name: string }) => a.name).sort()).toEqual([
        'Cash And Carry Mart',
        'Mini Mart',
      ]);
    });

    it('filters by status', async () => {
      const wholesale = (await list(adminA, '?q=wholesale')).body.items[0];
      await update(adminA, wholesale.id, { isActive: false }).expect(200);

      const inactive = await list(adminA, '?status=inactive').expect(200);
      expect(inactive.body.items.map((a: { name: string }) => a.name)).toEqual(['Wholesale']);
      const active = await list(adminA, '?status=active').expect(200);
      expect(active.body.items.every((a: { isActive: boolean }) => a.isActive)).toBe(true);
    });

    it('paginates', async () => {
      const all = await list(adminA).expect(200);
      const page2 = await list(adminA, '?pageSize=2&page=2').expect(200);
      expect(page2.body.items).toEqual(all.body.items.slice(2, 4));
    });

    it('rejects invalid query parameters', async () => {
      await list(adminA, '?status=deleted').expect(400);
      await list(adminA, '?pageSize=0').expect(400);
    });
  });

  describe('permissions', () => {
    it('Order Booker cannot use any shop category management endpoint', async () => {
      const categoryId = (await list(adminA)).body.items[0].id;
      await list(bookerA).expect(403);
      await http().get(`/api/shop-categories/${categoryId}`).set(auth(bookerA)).expect(403);
      await create(bookerA, { name: 'Booker Category' }).expect(403);
      await update(bookerA, categoryId, { isActive: false }).expect(403);
    });

    it('Super Admin cannot use organization shop category endpoints', async () => {
      await list(superAdmin).expect(403);
      await create(superAdmin, { name: 'Platform Category' }).expect(403);
    });

    it('requires authentication', async () => {
      await http().get('/api/shop-categories').expect(401);
      await http().post('/api/shop-categories').send({ name: 'X' }).expect(401);
    });
  });

  describe('tenant isolation', () => {
    it('lists only the caller organization categories', async () => {
      const resB = await list(adminB, '?pageSize=100').expect(200);
      const orgBIds = (await t.prisma.shopCategory.findMany({ where: { organizationId: orgB.id } }))
        .map((a) => a.id)
        .sort();
      expect(resB.body.items.map((a: { id: string }) => a.id).sort()).toEqual(orgBIds);
      expect(resB.body.items.map((a: { name: string }) => a.name)).toEqual(['General Store']);
    });

    it('Org A cannot read, rename or deactivate an Org B category (404) and B is unchanged', async () => {
      const categoryB = await t.prisma.shopCategory.findFirstOrThrow({
        where: { organizationId: orgB.id },
      });

      await http().get(`/api/shop-categories/${categoryB.id}`).set(auth(adminA)).expect(404);
      await update(adminA, categoryB.id, { name: 'Hacked', isActive: false }).expect(404);

      const after = await t.prisma.shopCategory.findUniqueOrThrow({ where: { id: categoryB.id } });
      expect(after).toMatchObject({
        name: 'General Store',
        isActive: true,
        organizationId: orgB.id,
      });
    });

    it('a duplicate check in Org A does not reveal or block Org B names', async () => {
      await create(adminB, { name: 'Only In B' }).expect(201);
      await create(adminA, { name: 'Only In B' }).expect(201);
    });
  });
});
