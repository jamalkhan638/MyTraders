import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };

describe('Order Booker app data (e2e)', () => {
  let t: TestApp;
  let ahmedToken: string;
  let usmanToken: string;
  let adminToken: string;
  let saddar: Id;
  let cantt: Id;
  let ahmedShop1: Id;
  let usmanShop: Id;
  let inactiveShop: Id;
  let shopB: Id;

  const http = () => request(t.app.getHttpServer());
  const get = (token: string, path: string) =>
    http().get(`/api/booker${path}`).set('Authorization', `Bearer ${token}`);
  const names = (res: request.Response) => res.body.items.map((x: { name: string }) => x.name);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    const orgA = await createOrganization(t.prisma, { name: 'Org A' });
    const orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    const ahmed = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const usman = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const bookerB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ORDER_BOOKER' });

    saddar = await f.area(orgA.id, 'Saddar');
    cantt = await f.area(orgA.id, 'Cantt');
    const areaB = await f.area(orgB.id, 'Saddar');
    ahmedShop1 = await f.shop(orgA.id, 'Ali General Store', saddar.id, ahmed.id);
    await f.shop(orgA.id, 'City Mart', saddar.id, ahmed.id);
    await f.shop(orgA.id, 'Bilal Traders', cantt.id, ahmed.id);
    inactiveShop = await f.shop(orgA.id, 'Closed Shop', saddar.id, ahmed.id, false);
    usmanShop = await f.shop(orgA.id, 'Usman Shop', cantt.id, usman.id);
    await f.shop(orgA.id, 'Unassigned Shop', saddar.id, null);
    shopB = await f.shop(orgB.id, 'Org B Shop', areaB.id, bookerB.id);

    await f.product(orgA.id, 'Dalda 5L Pouch', true, 'P-5L');
    await f.product(orgA.id, 'Dalda Ghee 1Kg', true, 'G-1');
    await f.product(orgA.id, 'Old Product', false);
    await f.product(orgB.id, 'Org B Product');

    ahmedToken = (await login(t.app, ahmed.email)).accessToken;
    usmanToken = (await login(t.app, usman.email)).accessToken;
    adminToken = (await login(t.app, admin.email)).accessToken;
  });

  afterAll(() => t.close());

  describe('My Shops', () => {
    it('lists only my active assigned shops, by area then name', async () => {
      const res = await get(ahmedToken, '/shops').expect(200);
      expect(names(res)).toEqual(['Bilal Traders', 'Ali General Store', 'City Mart']);
      expect(res.body.items[0]).toEqual({
        id: expect.any(String),
        name: 'Bilal Traders',
        contactPerson: null,
        phone: null,
        address: null,
        area: { id: cantt.id, name: 'Cantt' },
      });
      expect(names(await get(usmanToken, '/shops').expect(200))).toEqual(['Usman Shop']);
    });

    it('filters by area and searches by shop name', async () => {
      expect(names(await get(ahmedToken, `/shops?areaId=${saddar.id}`).expect(200))).toEqual([
        'Ali General Store',
        'City Mart',
      ]);
      expect(names(await get(ahmedToken, '/shops?q=MART').expect(200))).toEqual(['City Mart']);
      expect(names(await get(ahmedToken, `/shops?q=mart&areaId=${cantt.id}`).expect(200))).toEqual(
        [],
      );
    });

    it('paginates', async () => {
      const res = await get(ahmedToken, '/shops?pageSize=2&page=2').expect(200);
      expect(res.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(names(res)).toEqual(['City Mart']);
    });

    it('opens one of my shops, but not an inactive, unassigned, other booker or other company shop', async () => {
      expect((await get(ahmedToken, `/shops/${ahmedShop1.id}`).expect(200)).body.name).toBe(
        'Ali General Store',
      );
      await get(ahmedToken, `/shops/${inactiveShop.id}`).expect(404);
      await get(ahmedToken, `/shops/${usmanShop.id}`).expect(404);
      await get(ahmedToken, `/shops/${shopB.id}`).expect(404);
    });

    it('lists the areas of my active shops with shop counts', async () => {
      const res = await get(ahmedToken, '/areas').expect(200);
      expect(res.body).toEqual([
        { id: cantt.id, name: 'Cantt', shopCount: 1 },
        { id: saddar.id, name: 'Saddar', shopCount: 2 },
      ]);
    });
  });

  describe('products', () => {
    it('lists only active products of my company, without any price', async () => {
      const res = await get(ahmedToken, '/products').expect(200);
      expect(names(res)).toEqual(['Dalda 5L Pouch', 'Dalda Ghee 1Kg']);
      const keys = Object.keys(res.body.items[0]).sort();
      expect(keys).toEqual([
        'code',
        'id',
        'name',
        'piecesPerCarton',
        'type',
        'weight',
        'weightBasis',
        'weightUnit',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/price|cost|tax/i);
    });

    it('searches by name or code', async () => {
      expect(names(await get(ahmedToken, '/products?q=ghee').expect(200))).toEqual([
        'Dalda Ghee 1Kg',
      ]);
      expect(names(await get(ahmedToken, '/products?q=p-5').expect(200))).toEqual([
        'Dalda 5L Pouch',
      ]);
    });
  });

  describe('permissions', () => {
    it('is for order bookers only', async () => {
      await get(adminToken, '/shops').expect(403);
      await get(adminToken, '/products').expect(403);
      await http().get('/api/booker/shops').expect(401);
    });

    it('order bookers still cannot use admin shop and product endpoints', async () => {
      await http().get('/api/shops').set('Authorization', `Bearer ${ahmedToken}`).expect(403);
      await http().get('/api/products').set('Authorization', `Bearer ${ahmedToken}`).expect(403);
    });
  });
});
