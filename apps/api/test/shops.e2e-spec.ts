import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };

describe('Shops (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let orgB: Id;
  let adminA: string;
  let adminB: string;
  let bookerAToken: string;
  let superAdmin: string;
  // Org A reference data
  let saddar: Id;
  let cantt: Id;
  let closedArea: Id;
  let general: Id;
  let wholesale: Id;
  let oldCategory: Id;
  let ahmed: Id & { email: string };
  let usman: Id;
  let retiredBooker: Id;
  let adminAUser: Id & { email: string };
  // Org B reference data
  let areaB: Id;
  let categoryB: Id;
  let bookerB: Id;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token: string, query = '') => http().get(`/api/shops${query}`).set(auth(token));
  const create = (token: string, body: object) =>
    http().post('/api/shops').set(auth(token)).send(body);
  const update = (token: string, id: string, body: object) =>
    http().patch(`/api/shops/${id}`).set(auth(token)).send(body);
  const names = (res: request.Response) => res.body.items.map((s: { name: string }) => s.name);
  const details = (res: request.Response) =>
    res.body.details as { path: string; message: string }[];

  const area = (organizationId: string, name: string, isActive = true) =>
    t.prisma.area.create({
      data: { organizationId, name, nameNormalized: name.toLowerCase(), isActive },
    });
  const category = (organizationId: string, name: string, isActive = true) =>
    t.prisma.shopCategory.create({
      data: { organizationId, name, nameNormalized: name.toLowerCase(), isActive },
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });

    saddar = await area(orgA.id, 'Saddar');
    cantt = await area(orgA.id, 'Cantt');
    closedArea = await area(orgA.id, 'Closed Area', false);
    general = await category(orgA.id, 'General Store');
    wholesale = await category(orgA.id, 'Wholesale');
    oldCategory = await category(orgA.id, 'Old Category', false);
    adminAUser = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    ahmed = await createUser(t.prisma, {
      organizationId: orgA.id,
      role: 'ORDER_BOOKER',
      name: 'Ahmed',
    });
    usman = await createUser(t.prisma, {
      organizationId: orgA.id,
      role: 'ORDER_BOOKER',
      name: 'Usman',
    });
    retiredBooker = await createUser(t.prisma, {
      organizationId: orgA.id,
      role: 'ORDER_BOOKER',
      isActive: false,
    });

    areaB = await area(orgB.id, 'Saddar');
    categoryB = await category(orgB.id, 'General Store');
    bookerB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ORDER_BOOKER' });
    const adminBUser = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const superUser = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });

    adminA = (await login(t.app, adminAUser.email)).accessToken;
    adminB = (await login(t.app, adminBUser.email)).accessToken;
    bookerAToken = (await login(t.app, ahmed.email)).accessToken;
    superAdmin = (await login(t.app, superUser.email)).accessToken;
  });

  afterAll(() => t.close());

  describe('create', () => {
    it('creates a shop with all fields and returns area / category / booker names', async () => {
      const res = await create(adminA, {
        name: 'Save Mart G-11',
        contactPerson: 'Shoaib',
        phone: '0300 1234567',
        address: 'G-11 Islamabad',
        ntn: '---',
        strn: '3277876146171',
        cnic: '13101-9798237-5',
        areaId: saddar.id,
        categoryId: general.id,
        assignedOrderBookerId: ahmed.id,
      }).expect(201);

      expect(res.body).toMatchObject({
        name: 'Save Mart G-11',
        contactPerson: 'Shoaib',
        phone: '0300 1234567',
        cnic: '13101-9798237-5',
        area: { id: saddar.id, name: 'Saddar', isActive: true },
        category: { id: general.id, name: 'General Store' },
        assignedOrderBooker: { id: ahmed.id, name: 'Ahmed' },
        isActive: true,
      });
      expect(res.body.createdAt).toEqual(expect.any(String));
      const stored = await t.prisma.shop.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.organizationId).toBe(orgA.id);
    });

    it('creates a shop with only name and area', async () => {
      const res = await create(adminA, {
        name: '  Ali   General Store ',
        areaId: saddar.id,
      }).expect(201);
      expect(res.body).toMatchObject({
        name: 'Ali General Store',
        contactPerson: null,
        phone: null,
        category: null,
        assignedOrderBooker: null,
      });
    });

    it('allows two shops with the same name', async () => {
      await create(adminA, { name: 'Ali General Store', areaId: cantt.id }).expect(201);
    });

    it('ignores organizationId sent by the client', async () => {
      const res = await create(adminA, {
        name: 'City Mart',
        areaId: cantt.id,
        organizationId: orgB.id,
      }).expect(201);
      const stored = await t.prisma.shop.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.organizationId).toBe(orgA.id);
    });
  });

  describe('required fields and validation', () => {
    it('requires name and area', async () => {
      const res = await create(adminA, {}).expect(400);
      expect(details(res)).toEqual([
        { path: 'name', message: 'Shop name is required' },
        { path: 'areaId', message: 'Area is required' },
      ]);
      await create(adminA, { name: '   ', areaId: saddar.id }).expect(400);
    });

    it.each([
      ['a malformed area id', { areaId: 'saddar' }, 'areaId'],
      ['a malformed category id', { categoryId: 'general' }, 'categoryId'],
      ['a malformed booker id', { assignedOrderBookerId: 'ahmed' }, 'assignedOrderBookerId'],
      ['letters in the phone', { phone: 'call me' }, 'phone'],
      ['letters in the CNIC', { cnic: '13101-ABC' }, 'cnic'],
      ['a too-long name', { name: 'x'.repeat(151) }, 'name'],
      ['a too-long address', { address: 'x'.repeat(301) }, 'address'],
    ])('rejects %s', async (_label, patch, path) => {
      const res = await create(adminA, { name: 'Validation', areaId: saddar.id, ...patch }).expect(
        400,
      );
      expect(details(res).map((d) => d.path)).toEqual([path]);
    });
  });

  describe('area / category / order booker validation', () => {
    it('rejects an area that does not exist or is inactive', async () => {
      const missing = await create(adminA, {
        name: 'X',
        areaId: '0199a000-0000-7000-8000-000000000000',
      }).expect(422);
      expect(details(missing)).toEqual([{ path: 'areaId', message: 'Area not found' }]);
      const inactive = await create(adminA, { name: 'X', areaId: closedArea.id }).expect(422);
      expect(details(inactive)).toEqual([{ path: 'areaId', message: 'This area is inactive' }]);
    });

    it('rejects a shop category that is inactive', async () => {
      const inactive = await create(adminA, {
        name: 'X',
        areaId: saddar.id,
        categoryId: oldCategory.id,
      }).expect(422);
      expect(details(inactive)).toEqual([
        { path: 'categoryId', message: 'This shop category is inactive' },
      ]);
    });

    it('rejects an inactive order booker and a user who is not an order booker', async () => {
      const inactive = await create(adminA, {
        name: 'X',
        areaId: saddar.id,
        assignedOrderBookerId: retiredBooker.id,
      }).expect(422);
      expect(details(inactive)).toEqual([
        { path: 'assignedOrderBookerId', message: 'This order booker is inactive' },
      ]);
      const admin = await create(adminA, {
        name: 'X',
        areaId: saddar.id,
        assignedOrderBookerId: adminAUser.id,
      }).expect(422);
      expect(details(admin)).toEqual([
        { path: 'assignedOrderBookerId', message: 'Order booker not found' },
      ]);
    });

    it('reports every invalid reference at once and saves nothing', async () => {
      const res = await create(adminA, {
        name: 'X',
        areaId: closedArea.id,
        categoryId: oldCategory.id,
        assignedOrderBookerId: retiredBooker.id,
      }).expect(422);
      expect(details(res).map((d) => d.path)).toEqual([
        'areaId',
        'categoryId',
        'assignedOrderBookerId',
      ]);
      expect(await t.prisma.shop.count({ where: { name: 'X' } })).toBe(0);
    });
  });

  describe('cross-tenant foreign keys', () => {
    it("Company A cannot use Company B's area, category or order booker", async () => {
      const res = await create(adminA, {
        name: 'Cross Tenant',
        areaId: areaB.id,
        categoryId: categoryB.id,
        assignedOrderBookerId: bookerB.id,
      }).expect(422);
      expect(details(res)).toEqual([
        { path: 'areaId', message: 'Area not found' },
        { path: 'categoryId', message: 'Shop category not found' },
        { path: 'assignedOrderBookerId', message: 'Order booker not found' },
      ]);
      expect(await t.prisma.shop.count({ where: { name: 'Cross Tenant' } })).toBe(0);
    });

    it("Company A cannot move its shop to Company B's references on edit", async () => {
      const shop = (await create(adminA, { name: 'Edit Cross', areaId: saddar.id }).expect(201))
        .body;
      await update(adminA, shop.id, { areaId: areaB.id }).expect(422);
      await update(adminA, shop.id, { categoryId: categoryB.id }).expect(422);
      await update(adminA, shop.id, { assignedOrderBookerId: bookerB.id }).expect(422);
      const stored = await t.prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
      expect(stored).toMatchObject({
        areaId: saddar.id,
        categoryId: null,
        assignedOrderBookerId: null,
      });
    });
  });

  describe('edit / deactivate / reactivate', () => {
    let shopId: string;

    beforeAll(async () => {
      const res = await create(adminA, {
        name: 'Madina Store',
        areaId: saddar.id,
        categoryId: general.id,
        phone: '0311',
      }).expect(201);
      shopId = res.body.id;
    });

    it('edits details and changes area, category and order booker', async () => {
      const res = await update(adminA, shopId, {
        name: 'Madina Super Store',
        contactPerson: 'Bilal',
        areaId: cantt.id,
        categoryId: wholesale.id,
        assignedOrderBookerId: usman.id,
      }).expect(200);
      expect(res.body).toMatchObject({
        name: 'Madina Super Store',
        contactPerson: 'Bilal',
        phone: '0311',
        area: { name: 'Cantt' },
        category: { name: 'Wholesale' },
        assignedOrderBooker: { name: 'Usman' },
      });
    });

    it('reassigns and removes the order booker and removes the category', async () => {
      const reassigned = await update(adminA, shopId, { assignedOrderBookerId: ahmed.id }).expect(
        200,
      );
      expect(reassigned.body.assignedOrderBooker.name).toBe('Ahmed');
      const res = await update(adminA, shopId, {
        assignedOrderBookerId: null,
        categoryId: '',
      }).expect(200);
      expect(res.body).toMatchObject({ assignedOrderBooker: null, category: null });
    });

    it('clears optional text fields', async () => {
      const res = await update(adminA, shopId, { phone: '', contactPerson: null }).expect(200);
      expect(res.body).toMatchObject({ phone: null, contactPerson: null });
    });

    it('still allows editing a shop whose area was deactivated later', async () => {
      const area2 = await area(orgA.id, 'Soon Closed');
      const shop = (await create(adminA, { name: 'Old Area Shop', areaId: area2.id }).expect(201))
        .body;
      await t.prisma.area.update({ where: { id: area2.id }, data: { isActive: false } });
      const res = await update(adminA, shop.id, { phone: '0322' }).expect(200);
      expect(res.body).toMatchObject({ phone: '0322', area: { id: area2.id, isActive: false } });
    });

    it('deactivates and reactivates', async () => {
      expect((await update(adminA, shopId, { isActive: false }).expect(200)).body.isActive).toBe(
        false,
      );
      expect((await update(adminA, shopId, { isActive: true }).expect(200)).body.isActive).toBe(
        true,
      );
    });

    it('returns 404 for an unknown id and 400 for a malformed id', async () => {
      await update(adminA, '0199a000-0000-7000-8000-000000000000', { name: 'X' }).expect(404);
      await http().get('/api/shops/not-a-uuid').set(auth(adminA)).expect(400);
    });
  });

  describe('search / filters / pagination', () => {
    beforeAll(async () => {
      await create(adminA, {
        name: 'Bilal Traders',
        areaId: cantt.id,
        categoryId: wholesale.id,
        contactPerson: 'Kamran',
        phone: '0345 9990001',
        assignedOrderBookerId: usman.id,
      }).expect(201);
      const inactive = await create(adminA, {
        name: 'Closed Kiryana',
        areaId: saddar.id,
        assignedOrderBookerId: ahmed.id,
      }).expect(201);
      await update(adminA, inactive.body.id, { isActive: false }).expect(200);
    });

    it('searches by shop name, contact person and phone', async () => {
      expect(names(await list(adminA, '?q=BILAL').expect(200))).toEqual(['Bilal Traders']);
      expect(names(await list(adminA, '?q=kamran').expect(200))).toEqual(['Bilal Traders']);
      expect(names(await list(adminA, '?q=9990001').expect(200))).toEqual(['Bilal Traders']);
    });

    it('filters by area, category, order booker, unassigned and status', async () => {
      const byArea = await list(adminA, `?areaId=${cantt.id}&pageSize=100`).expect(200);
      expect(byArea.body.items.length).toBeGreaterThan(0);
      expect(byArea.body.items.every((s: { area: Id }) => s.area.id === cantt.id)).toBe(true);

      expect(names(await list(adminA, `?categoryId=${wholesale.id}`).expect(200))).toEqual([
        'Bilal Traders',
      ]);

      const byBooker = await list(adminA, `?orderBookerId=${ahmed.id}&pageSize=100`).expect(200);
      expect(byBooker.body.items.length).toBeGreaterThan(0);
      expect(
        byBooker.body.items.every(
          (s: { assignedOrderBooker: Id }) => s.assignedOrderBooker.id === ahmed.id,
        ),
      ).toBe(true);

      const unassigned = await list(adminA, '?orderBookerId=unassigned&pageSize=100').expect(200);
      expect(unassigned.body.items.length).toBeGreaterThan(0);
      expect(
        unassigned.body.items.every(
          (s: { assignedOrderBooker: null }) => s.assignedOrderBooker === null,
        ),
      ).toBe(true);

      expect(names(await list(adminA, '?status=inactive').expect(200))).toEqual(['Closed Kiryana']);
    });

    it('combines filters', async () => {
      const res = await list(
        adminA,
        `?areaId=${saddar.id}&orderBookerId=${ahmed.id}&status=active`,
      ).expect(200);
      expect(names(res)).toEqual(['Save Mart G-11']);
    });

    it('paginates in name order', async () => {
      const all = await list(adminA, '?pageSize=100').expect(200);
      const sorted = [...names(all)].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0));
      expect(names(all)).toEqual(sorted);
      const page2 = await list(adminA, '?pageSize=3&page=2').expect(200);
      expect(page2.body.items).toEqual(all.body.items.slice(3, 6));
      expect(page2.body.total).toBe(all.body.total);
    });

    it('rejects invalid query parameters', async () => {
      await list(adminA, '?areaId=saddar').expect(400);
      await list(adminA, '?orderBookerId=nobody').expect(400);
      await list(adminA, '?status=closed').expect(400);
    });
  });

  describe('permissions', () => {
    it('Order Booker cannot use any shop management endpoint', async () => {
      const shopId = (await list(adminA)).body.items[0].id;
      await list(bookerAToken).expect(403);
      await http().get(`/api/shops/${shopId}`).set(auth(bookerAToken)).expect(403);
      await create(bookerAToken, { name: 'Mine', areaId: saddar.id }).expect(403);
      await update(bookerAToken, shopId, { assignedOrderBookerId: ahmed.id }).expect(403);
    });

    it('Super Admin cannot use organization shop endpoints', async () => {
      await list(superAdmin).expect(403);
      await create(superAdmin, { name: 'Platform', areaId: saddar.id }).expect(403);
    });

    it('requires authentication', async () => {
      await http().get('/api/shops').expect(401);
      await http().post('/api/shops').send({ name: 'X', areaId: saddar.id }).expect(401);
    });
  });

  describe('tenant isolation', () => {
    let shopB: Id;

    beforeAll(async () => {
      const res = await create(adminB, {
        name: 'B Shop',
        areaId: areaB.id,
        categoryId: categoryB.id,
        assignedOrderBookerId: bookerB.id,
      }).expect(201);
      shopB = res.body;
    });

    it('lists only the caller organization shops', async () => {
      expect(names(await list(adminB, '?pageSize=100').expect(200))).toEqual(['B Shop']);
      const resA = await list(adminA, '?pageSize=100').expect(200);
      expect(resA.body.items.map((s: Id) => s.id)).not.toContain(shopB.id);
    });

    it('filtering by another organization area or booker returns nothing', async () => {
      expect((await list(adminA, `?areaId=${areaB.id}`).expect(200)).body.total).toBe(0);
      expect((await list(adminA, `?orderBookerId=${bookerB.id}`).expect(200)).body.total).toBe(0);
    });

    it('Org A cannot read, edit or deactivate an Org B shop (404) and B is unchanged', async () => {
      await http().get(`/api/shops/${shopB.id}`).set(auth(adminA)).expect(404);
      await update(adminA, shopB.id, { name: 'Hacked', isActive: false }).expect(404);
      const stored = await t.prisma.shop.findUniqueOrThrow({ where: { id: shopB.id } });
      expect(stored).toMatchObject({ name: 'B Shop', isActive: true, organizationId: orgB.id });
    });
  });

  describe('data model', () => {
    it('has no manually maintained credit/balance column on Shop', async () => {
      const columns = await t.prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'Shop'`;
      const columnNames = columns.map((c) => c.column_name.toLowerCase());
      expect(columnNames.filter((n) => n.includes('credit') || n.includes('balance'))).toEqual([]);
    });
  });
});
