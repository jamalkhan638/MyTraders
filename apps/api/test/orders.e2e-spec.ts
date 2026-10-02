import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };

describe('Orders (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let orgB: Id;
  let ahmed: Id;
  let usman: Id;
  let ahmedToken: string;
  let usmanToken: string;
  let adminToken: string;
  let adminBToken: string;
  let bookerBToken: string;
  let superToken: string;
  let saddar: Id;
  let cantt: Id;
  let aliStore: Id;
  let cityMart: Id;
  let closedShop: Id;
  let usmanShop: Id;
  let unassignedShop: Id;
  let shopB: Id;
  let pouch: Id;
  let ghee: Id;
  let tin: Id;
  let oldProduct: Id;
  let productB: Id;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const create = (token: string, body: object) =>
    http().post('/api/orders').set(auth(token)).send(body);
  const list = (token: string, query = '') => http().get(`/api/orders${query}`).set(auth(token));
  const get = (token: string, id: string) => http().get(`/api/orders/${id}`).set(auth(token));
  const cancel = (token: string, id: string) =>
    http().post(`/api/orders/${id}/cancel`).set(auth(token));
  const order = (shop: Id, ...items: [Id, number][]) => ({
    shopId: shop.id,
    items: items.map(([product, quantity]) => ({ productId: product.id, quantity })),
  });
  const details = (res: request.Response) =>
    res.body.details as { path: string; message: string }[];
  const numbers = (res: request.Response) =>
    res.body.items.map((o: { orderNumber: string }) => o.orderNumber);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    await t.prisma.organization.update({
      where: { id: orgA.id },
      data: { orderPrefix: 'OB-', orderNumberDigits: 5 },
    });

    const admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
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
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const bookerB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ORDER_BOOKER' });
    const superUser = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });

    saddar = await f.area(orgA.id, 'Saddar');
    cantt = await f.area(orgA.id, 'Cantt');
    const areaB = await f.area(orgB.id, 'Saddar');
    aliStore = await f.shop(orgA.id, 'Ali General Store', saddar.id, ahmed.id);
    cityMart = await f.shop(orgA.id, 'City Mart', cantt.id, ahmed.id);
    closedShop = await f.shop(orgA.id, 'Closed Shop', saddar.id, ahmed.id, false);
    usmanShop = await f.shop(orgA.id, 'Usman Shop', cantt.id, usman.id);
    unassignedShop = await f.shop(orgA.id, 'Unassigned Shop', saddar.id, null);
    shopB = await f.shop(orgB.id, 'Org B Shop', areaB.id, bookerB.id);

    pouch = await f.product(orgA.id, 'Dalda 5L Pouch');
    ghee = await f.product(orgA.id, 'Dalda Ghee 1Kg');
    tin = await f.product(orgA.id, 'Dalda 4.5Kg Tin');
    oldProduct = await f.product(orgA.id, 'Old Product', false);
    productB = await f.product(orgB.id, 'Org B Product');

    ahmedToken = (
      await login(t.app, (await t.prisma.user.findUniqueOrThrow({ where: { id: ahmed.id } })).email)
    ).accessToken;
    usmanToken = (
      await login(t.app, (await t.prisma.user.findUniqueOrThrow({ where: { id: usman.id } })).email)
    ).accessToken;
    adminToken = (await login(t.app, admin.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;
    bookerBToken = (await login(t.app, bookerB.email)).accessToken;
    superToken = (await login(t.app, superUser.email)).accessToken;
  });

  afterAll(() => t.close());

  describe('Order Booker creates an order', () => {
    it('saves a PENDING order with several products and a server-generated number', async () => {
      const res = await create(ahmedToken, {
        ...order(aliStore, [pouch, 5], [ghee, 10], [tin, 3]),
        notes: 'Deliver tomorrow',
      }).expect(201);
      expect(res.body).toMatchObject({
        orderNumber: 'OB-00001',
        status: 'PENDING',
        shop: { id: aliStore.id, name: 'Ali General Store' },
        area: { id: saddar.id, name: 'Saddar' },
        orderBooker: { id: ahmed.id, name: 'Ahmed' },
        itemCount: 3,
        totalQuantity: 18,
        notes: 'Deliver tomorrow',
        cancelledAt: null,
      });
      expect(
        res.body.items.map((i: { product: { name: string }; quantity: number }) => [
          i.product.name,
          i.quantity,
        ]),
      ).toEqual([
        ['Dalda 4.5Kg Tin', 3],
        ['Dalda 5L Pouch', 5],
        ['Dalda Ghee 1Kg', 10],
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/price|cost|tax|discount/i);

      const stored = await t.prisma.order.findUniqueOrThrow({
        where: { id: res.body.id },
        include: { items: true },
      });
      expect(stored).toMatchObject({
        organizationId: orgA.id,
        orderBookerId: ahmed.id,
        status: 'PENDING',
      });
      expect(stored.items).toHaveLength(3);
    });

    it('numbers orders sequentially per organization', async () => {
      const res = await create(ahmedToken, order(cityMart, [pouch, 1])).expect(201);
      expect(res.body.orderNumber).toBe('OB-00002');
      const orgBOrder = await create(bookerBToken, order(shopB, [productB, 2])).expect(201);
      expect(orgBOrder.body.orderNumber).toBe('ORD-000001');
    });

    it('ignores client-supplied identity, number, status and prices', async () => {
      const res = await create(ahmedToken, {
        ...order(aliStore, [ghee, 2]),
        organizationId: orgB.id,
        orderBookerId: usman.id,
        orderNumber: 'HACK-1',
        status: 'INVOICED',
        items: [{ productId: ghee.id, quantity: 2, price: '0.01', discount: '99' }],
      }).expect(201);
      expect(res.body).toMatchObject({ status: 'PENDING', orderBooker: { id: ahmed.id } });
      expect(res.body.orderNumber).toMatch(/^OB-\d{5}$/);
      const stored = await t.prisma.order.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored).toMatchObject({ organizationId: orgA.id, orderBookerId: ahmed.id });
    });
  });

  describe('validation', () => {
    it.each([
      ['zero quantity', 0, 'Quantity must be at least 1'],
      ['negative quantity', -3, 'Quantity must be at least 1'],
      ['fractional quantity', 1.5, 'Quantity must be a whole number'],
      ['quantity as text', '5', 'Quantity must be a whole number'],
      ['too large quantity', 100_001, 'Quantity must be at most 100,000'],
    ])('rejects a %s', async (_label, quantity, message) => {
      const res = await create(ahmedToken, {
        shopId: aliStore.id,
        items: [{ productId: pouch.id, quantity }],
      }).expect(400);
      expect(details(res)).toEqual([{ path: 'items.0.quantity', message }]);
    });

    it('requires a shop and at least one product', async () => {
      const res = await create(ahmedToken, {}).expect(400);
      expect(details(res).map((d) => d.path)).toEqual(['shopId', 'items']);
      await create(ahmedToken, { shopId: aliStore.id, items: [] }).expect(400);
    });

    it('rejects the same product twice (no silent merge)', async () => {
      const before = await t.prisma.order.count();
      const res = await create(
        ahmedToken,
        order(aliStore, [pouch, 2], [ghee, 1], [pouch, 3]),
      ).expect(400);
      expect(details(res)).toEqual([
        {
          path: 'items.2.productId',
          message: 'This product is already in the order — change its quantity instead',
        },
      ]);
      expect(await t.prisma.order.count()).toBe(before);
    });
  });

  describe('shop and product rules', () => {
    it.each([
      ['an inactive shop', () => closedShop, 'This shop is inactive'],
      ['an unassigned shop', () => unassignedShop, 'Shop not found or not assigned to you'],
      ["another booker's shop", () => usmanShop, 'Shop not found or not assigned to you'],
      ["another company's shop", () => shopB, 'Shop not found or not assigned to you'],
    ])('rejects %s', async (_label, shop, message) => {
      const res = await create(ahmedToken, order(shop(), [pouch, 1])).expect(422);
      expect(details(res)).toEqual([{ path: 'shopId', message }]);
    });

    it("rejects an inactive product and another company's product, and saves nothing", async () => {
      const before = await t.prisma.order.count();
      const counter = await t.prisma.organizationCounter.findUniqueOrThrow({
        where: { organizationId_key: { organizationId: orgA.id, key: 'ORDER' } },
      });
      const res = await create(
        ahmedToken,
        order(aliStore, [pouch, 1], [oldProduct, 1], [productB, 1]),
      ).expect(422);
      expect(details(res)).toEqual([
        { path: 'items.1.productId', message: 'This product is no longer available' },
        { path: 'items.2.productId', message: 'Product not found' },
      ]);
      expect(await t.prisma.order.count()).toBe(before);
      const after = await t.prisma.organizationCounter.findUniqueOrThrow({
        where: { organizationId_key: { organizationId: orgA.id, key: 'ORDER' } },
      });
      expect(after.nextValue).toBe(counter.nextValue); // no number consumed by a rejected order
    });
  });

  describe('order numbers under concurrency', () => {
    it('gives 15 simultaneous orders 15 different, consecutive numbers', async () => {
      const startValue = (
        await t.prisma.organizationCounter.findUniqueOrThrow({
          where: { organizationId_key: { organizationId: orgA.id, key: 'ORDER' } },
        })
      ).nextValue;
      const results = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          create(
            i % 2 ? ahmedToken : usmanToken,
            order(i % 2 ? cityMart : usmanShop, [ghee, i + 1]),
          ),
        ),
      );
      results.forEach((res) => expect(res.status).toBe(201));
      const got = results.map((res) => res.body.orderNumber).sort();
      const expected = Array.from(
        { length: 15 },
        (_, i) => `OB-${String(startValue + i).padStart(5, '0')}`,
      );
      expect(got).toEqual(expected);
    });
  });

  describe('who sees which orders', () => {
    it('an Order Booker sees only their own orders', async () => {
      const res = await list(usmanToken, '?pageSize=100').expect(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.items.every((o: { orderBooker: Id }) => o.orderBooker.id === usman.id)).toBe(
        true,
      );
    });

    it("a booker cannot widen the list with another booker's id", async () => {
      const res = await list(usmanToken, `?orderBookerId=${ahmed.id}&pageSize=100`).expect(200);
      expect(res.body.items.every((o: { orderBooker: Id }) => o.orderBooker.id === usman.id)).toBe(
        true,
      );
    });

    it("a booker cannot open or cancel another booker's order (404)", async () => {
      const ahmedOrder = (await list(ahmedToken)).body.items[0];
      await get(usmanToken, ahmedOrder.id).expect(404);
      await cancel(usmanToken, ahmedOrder.id).expect(404);
      expect((await get(ahmedToken, ahmedOrder.id).expect(200)).body.status).toBe('PENDING');
    });

    it('the Admin sees all organization orders, newest first', async () => {
      const res = await list(adminToken, '?pageSize=100').expect(200);
      const bookers = new Set(res.body.items.map((o: { orderBooker: Id }) => o.orderBooker.id));
      expect(bookers).toEqual(new Set([ahmed.id, usman.id]));
      const dates = res.body.items.map((o: { createdAt: string }) => o.createdAt);
      expect(dates).toEqual([...dates].sort().reverse());
    });
  });

  describe('Admin search / filters / pagination', () => {
    it('searches by order number and by shop name', async () => {
      expect(numbers(await list(adminToken, '?q=OB-00001').expect(200))).toEqual(['OB-00001']);
      const byShop = await list(adminToken, '?q=ali general&pageSize=100').expect(200);
      expect(byShop.body.items.every((o: { shop: Id }) => o.shop.id === aliStore.id)).toBe(true);
      expect(byShop.body.total).toBeGreaterThan(0);
    });

    it('filters by area, order booker and status', async () => {
      const byArea = await list(adminToken, `?areaId=${cantt.id}&pageSize=100`).expect(200);
      expect(byArea.body.items.every((o: { area: Id }) => o.area.id === cantt.id)).toBe(true);
      const byBooker = await list(adminToken, `?orderBookerId=${ahmed.id}&pageSize=100`).expect(
        200,
      );
      expect(
        byBooker.body.items.every((o: { orderBooker: Id }) => o.orderBooker.id === ahmed.id),
      ).toBe(true);

      const target = (await list(adminToken, '?q=OB-00002')).body.items[0];
      await cancel(adminToken, target.id).expect(200);
      expect(numbers(await list(adminToken, '?status=CANCELLED').expect(200))).toEqual([
        'OB-00002',
      ]);
      const pending = await list(adminToken, '?status=PENDING&pageSize=100').expect(200);
      expect(pending.body.items.every((o: { status: string }) => o.status === 'PENDING')).toBe(
        true,
      );
    });

    it('paginates', async () => {
      const all = await list(adminToken, '?pageSize=100').expect(200);
      const page2 = await list(adminToken, '?pageSize=4&page=2').expect(200);
      expect(page2.body.items).toEqual(all.body.items.slice(4, 8));
      expect(page2.body.total).toBe(all.body.total);
    });

    it('rejects invalid query parameters', async () => {
      await list(adminToken, '?status=DONE').expect(400);
      await list(adminToken, '?areaId=saddar').expect(400);
    });
  });

  describe('cancel', () => {
    it('a booker cancels their own pending order; it cannot be cancelled twice', async () => {
      const mine = (await create(ahmedToken, order(aliStore, [tin, 1])).expect(201)).body;
      const res = await cancel(ahmedToken, mine.id).expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', cancelledBy: { id: ahmed.id } });
      expect(res.body.cancelledAt).toEqual(expect.any(String));
      const again = await cancel(ahmedToken, mine.id).expect(409);
      expect(again.body.message).toBe(
        'Only pending orders can be cancelled (this order is cancelled)',
      );
    });
  });

  describe('permissions', () => {
    it('Admins cannot book orders; Super Admin cannot use orders', async () => {
      await create(adminToken, order(aliStore, [pouch, 1])).expect(403);
      await list(superToken).expect(403);
      await create(superToken, order(aliStore, [pouch, 1])).expect(403);
    });

    it('requires authentication', async () => {
      await http().get('/api/orders').expect(401);
      await http()
        .post('/api/orders')
        .send(order(aliStore, [pouch, 1]))
        .expect(401);
    });

    it('malformed ids return 400', async () => {
      await get(adminToken, 'not-a-uuid').expect(400);
    });
  });

  describe('tenant isolation', () => {
    it('each company sees only its own orders', async () => {
      const resB = await list(adminBToken, '?pageSize=100').expect(200);
      expect(numbers(resB)).toEqual(['ORD-000001']);
      const resA = await list(adminToken, '?pageSize=100').expect(200);
      expect(numbers(resA)).not.toContain('ORD-000001');
    });

    it("Company A cannot read or cancel Company B's order (404) and it stays unchanged", async () => {
      const orderB = (await list(adminBToken)).body.items[0];
      await get(adminToken, orderB.id).expect(404);
      await cancel(adminToken, orderB.id).expect(404);
      await get(ahmedToken, orderB.id).expect(404);
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: orderB.id } })).status).toBe(
        'PENDING',
      );
    });

    it("filtering by another company's area or booker returns nothing", async () => {
      const orderB = await t.prisma.order.findFirstOrThrow({
        where: { organizationId: orgB.id },
        include: { shop: true },
      });
      expect((await list(adminToken, `?areaId=${orderB.shop.areaId}`)).body.total).toBe(0);
      expect((await list(adminToken, `?orderBookerId=${orderB.orderBookerId}`)).body.total).toBe(0);
    });
  });
});
