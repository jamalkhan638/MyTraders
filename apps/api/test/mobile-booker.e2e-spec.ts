import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createOrganization, createUser, TEST_PASSWORD } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };
interface MobileSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: { id: string; role: string; organization: { id: string } | null };
}

/**
 * D-46 — the SupplyBeacon Booker Android app: mobile sessions (booker only, refresh token in the
 * body), idempotent offline orders (clientOrderId) and the server staying the final authority.
 */
describe('Mobile booker app (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let orgB: Id;
  let booker: Id & { email: string };
  let booker2: Id & { email: string };
  let admin: Id & { email: string };
  let superAdmin: Id & { email: string };
  let bookerB: Id & { email: string };
  let shop: Id;
  let shop2: Id;
  let otherBookersShop: Id;
  let shopB: Id;
  let tin: Id;
  let pouch: Id;
  let productB: Id;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const mobileLogin = (email: string, password = TEST_PASSWORD) =>
    http().post('/api/auth/mobile/login').send({ email, password });
  const session = async (email: string) =>
    (await mobileLogin(email).expect(200)).body as MobileSession;
  const order = (token: string, body: object) =>
    http().post('/api/orders').set(auth(token)).send(body);
  const body = (patch: object = {}) => ({
    shopId: shop.id,
    items: [
      { productId: tin.id, quantity: 12 },
      { productId: pouch.id, quantity: 3 },
    ],
    ...patch,
  });
  const orderCount = (where: object = {}) => t.prisma.order.count({ where });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Ali Akbar Traders' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    booker2 = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    superAdmin = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });
    bookerB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ORDER_BOOKER' });
    const area = await f.area(orgA.id, 'Saddar');
    const areaB = await f.area(orgB.id, 'B Area');
    shop = await f.shop(orgA.id, 'Bilal Store', area.id, booker.id);
    shop2 = await f.shop(orgA.id, 'Second Store', area.id, booker.id);
    otherBookersShop = await f.shop(orgA.id, 'Not Mine', area.id, booker2.id);
    shopB = await f.shop(orgB.id, 'B Store', areaB.id, bookerB.id);
    tin = await f.product(orgA.id, 'Tin One', true, 'T1', 'TIN');
    pouch = await f.product(orgA.id, 'Pouch One', true, 'P1', 'POUCH');
    productB = await f.product(orgB.id, 'B Product');
  });

  afterAll(() => t.close());

  describe('mobile sessions', () => {
    it('an Order Booker signs in; the refresh token comes in the body, never as a cookie', async () => {
      const res = await mobileLogin(booker.email).expect(200);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        refreshTokenExpiresAt: expect.any(String),
        user: { id: booker.id, role: 'ORDER_BOOKER', organization: { id: orgA.id } },
      });
    });

    it('Admin and Super Admin are refused with a clear message, and get no token', async () => {
      const before = await t.prisma.refreshToken.count();
      for (const user of [admin, superAdmin]) {
        const res = await mobileLogin(user.email).expect(403);
        expect(res.body.message).toMatch(/for Order Bookers only/);
        expect(res.body).not.toHaveProperty('accessToken');
      }
      expect(await t.prisma.refreshToken.count()).toBe(before);
      await mobileLogin(booker.email, 'wrong-password').expect(401);
    });

    it('refresh rotates the token; a reused old token is refused and ends the session', async () => {
      const first = await session(booker.email);
      const rotated = (
        await http()
          .post('/api/auth/mobile/refresh')
          .send({ refreshToken: first.refreshToken })
          .expect(200)
      ).body as MobileSession;
      expect(rotated.refreshToken).not.toBe(first.refreshToken);
      await http()
        .post('/api/auth/mobile/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      // reuse revoked the whole family: the rotated token is dead too
      await http()
        .post('/api/auth/mobile/refresh')
        .send({ refreshToken: rotated.refreshToken })
        .expect(401);
    });

    it('logout revokes the refresh token', async () => {
      const s = await session(booker.email);
      await http()
        .post('/api/auth/mobile/logout')
        .send({ refreshToken: s.refreshToken })
        .expect(204);
      await http()
        .post('/api/auth/mobile/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      await http().post('/api/auth/mobile/refresh').send({}).expect(400);
    });

    it('a booker token cannot reach Admin APIs', async () => {
      const s = await session(booker.email);
      await http().get('/api/invoices').set(auth(s.accessToken)).expect(403);
      await http().get('/api/reports/sales').set(auth(s.accessToken)).expect(403);
      await http().get('/api/shops').set(auth(s.accessToken)).expect(403);
    });
  });

  describe('master data for the offline cache', () => {
    it('only my active assigned shops, their areas, and active products without prices', async () => {
      const s = await session(booker.email);
      const shops = await http().get('/api/booker/shops?pageSize=100').set(auth(s.accessToken));
      expect(shops.body.items.map((x: Id) => x.id).sort()).toEqual([shop.id, shop2.id].sort());
      const areas = await http().get('/api/booker/areas').set(auth(s.accessToken)).expect(200);
      expect(areas.body).toEqual([expect.objectContaining({ name: 'Saddar', shopCount: 2 })]);
      const products = await http()
        .get('/api/booker/products?pageSize=100')
        .set(auth(s.accessToken))
        .expect(200);
      expect(products.body.items.map((p: { name: string }) => p.name).sort()).toEqual([
        'Pouch One',
        'Tin One',
      ]);
      for (const p of products.body.items) {
        expect(p).not.toHaveProperty('tradePrice');
        expect(p).not.toHaveProperty('invoiceCostPrice');
      }
      await http()
        .get(`/api/booker/shops/${otherBookersShop.id}`)
        .set(auth(s.accessToken))
        .expect(404);
      await http().get(`/api/booker/shops/${shopB.id}`).set(auth(s.accessToken)).expect(404);
    });
  });

  describe('idempotent offline orders (clientOrderId)', () => {
    it('the same clientOrderId sent 3 times creates one order; all replies are that order', async () => {
      const s = await session(booker.email);
      const clientOrderId = randomUUID();
      const replies = [];
      for (let i = 0; i < 3; i++) {
        replies.push((await order(s.accessToken, body({ clientOrderId }))).body);
      }
      expect(new Set(replies.map((r) => r.id)).size).toBe(1);
      expect(new Set(replies.map((r) => r.orderNumber)).size).toBe(1);
      expect(replies[0]).toMatchObject({ status: 'PENDING', clientOrderId, itemCount: 2 });
      expect(await orderCount({ clientOrderId })).toBe(1);
      // it shows in "my orders" with its client id, so the app can match it to the local order
      const mine = await http().get('/api/orders?pageSize=100').set(auth(s.accessToken));
      expect(
        mine.body.items.filter((o: { clientOrderId: string }) => o.clientOrderId === clientOrderId),
      ).toHaveLength(1);
    });

    it('simultaneous sends of one clientOrderId still create only one order', async () => {
      const s = await session(booker.email);
      const clientOrderId = randomUUID();
      const replies = await Promise.all(
        [1, 2, 3, 4].map(() => order(s.accessToken, body({ clientOrderId }))),
      );
      expect(replies.every((r) => r.status === 201)).toBe(true);
      expect(new Set(replies.map((r) => r.body.orderNumber)).size).toBe(1);
      expect(await orderCount({ clientOrderId })).toBe(1);
    });

    it('another booker reusing my clientOrderId gets 409, never my order', async () => {
      const mine = await session(booker.email);
      const other = await session(booker2.email);
      const clientOrderId = randomUUID();
      await order(mine.accessToken, body({ clientOrderId })).expect(201);
      const res = await order(
        other.accessToken,
        body({ clientOrderId, shopId: otherBookersShop.id }),
      ).expect(409);
      expect(res.body).not.toHaveProperty('orderNumber');
    });

    it('another organization can use the same id independently (uniqueness is per organization)', async () => {
      const a = await session(booker.email);
      const b = await session(bookerB.email);
      const clientOrderId = randomUUID();
      await order(a.accessToken, body({ clientOrderId })).expect(201);
      const resB = await order(b.accessToken, {
        shopId: shopB.id,
        items: [{ productId: productB.id, quantity: 1 }],
        clientOrderId,
      }).expect(201);
      expect(await orderCount({ clientOrderId })).toBe(2);
      expect(await t.prisma.order.findFirst({ where: { id: resB.body.id } })).toMatchObject({
        organizationId: orgB.id,
      });
    });

    it('a forged organizationId is ignored: the order belongs to my organization', async () => {
      const s = await session(booker.email);
      const res = await order(
        s.accessToken,
        body({ clientOrderId: randomUUID(), organizationId: orgB.id, orderBookerId: bookerB.id }),
      ).expect(201);
      expect(await t.prisma.order.findFirst({ where: { id: res.body.id } })).toMatchObject({
        organizationId: orgA.id,
        orderBookerId: booker.id,
      });
    });

    it('an invalid client id is refused (400)', async () => {
      const s = await session(booker.email);
      await order(s.accessToken, body({ clientOrderId: 'abc-123' })).expect(400);
    });
  });

  describe('the server stays the authority when an offline order syncs', () => {
    it('product deactivated while offline → 422 with its name, no order; fixed order with the same id succeeds', async () => {
      const s = await session(booker.email);
      const retired = await fixtures(t.prisma).product(orgA.id, 'Retired Tin');
      const clientOrderId = randomUUID();
      await t.prisma.product.update({ where: { id: retired.id }, data: { isActive: false } });
      const res = await order(
        s.accessToken,
        body({
          clientOrderId,
          items: [
            { productId: tin.id, quantity: 1 },
            { productId: retired.id, quantity: 2 },
          ],
        }),
      ).expect(422);
      expect(res.body.details).toContainEqual(
        expect.objectContaining({ path: 'items.1.productId' }),
      );
      expect(await orderCount({ clientOrderId })).toBe(0);
      // the booker removes the product and resubmits the same local order (same id)
      const fixed = await order(
        s.accessToken,
        body({ clientOrderId, items: [{ productId: tin.id, quantity: 1 }] }),
      ).expect(201);
      expect(fixed.body.clientOrderId).toBe(clientOrderId);
      expect(await orderCount({ clientOrderId })).toBe(1);
    });

    it('shop deactivated or unassigned while offline → 422 with a clear message', async () => {
      const s = await session(booker.email);
      await t.prisma.shop.update({ where: { id: shop2.id }, data: { isActive: false } });
      const inactive = await order(
        s.accessToken,
        body({ shopId: shop2.id, clientOrderId: randomUUID() }),
      ).expect(422);
      expect(inactive.body.details).toContainEqual({
        path: 'shopId',
        message: 'This shop is inactive',
      });
      await t.prisma.shop.update({
        where: { id: shop2.id },
        data: { isActive: true, assignedOrderBookerId: booker2.id },
      });
      const unassigned = await order(
        s.accessToken,
        body({ shopId: shop2.id, clientOrderId: randomUUID() }),
      ).expect(422);
      expect(unassigned.body.details[0].message).toMatch(/not assigned to you/);
      // org B's shop is just as unknown
      await order(s.accessToken, body({ shopId: shopB.id, clientOrderId: randomUUID() })).expect(
        422,
      );
    });

    it('a disabled booker cannot sync and is told why on refresh', async () => {
      const disabled = await createUser(t.prisma, {
        organizationId: orgA.id,
        role: 'ORDER_BOOKER',
      });
      const s = await session(disabled.email);
      await t.prisma.user.update({ where: { id: disabled.id }, data: { isActive: false } });
      const res = await order(s.accessToken, body({ clientOrderId: randomUUID() }));
      expect([401, 403]).toContain(res.status);
      const refresh = await http()
        .post('/api/auth/mobile/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      expect(refresh.body.message).toBe('Your account is inactive');
      await mobileLogin(disabled.email).expect(401);
    });

    it('a suspended organization cannot sync and is told why on refresh', async () => {
      const orgC = await createOrganization(t.prisma, { name: 'Org C' });
      const bookerC = await createUser(t.prisma, { organizationId: orgC.id, role: 'ORDER_BOOKER' });
      const areaC = await fixtures(t.prisma).area(orgC.id, 'C Area');
      const shopC = await fixtures(t.prisma).shop(orgC.id, 'C Store', areaC.id, bookerC.id);
      const productC = await fixtures(t.prisma).product(orgC.id, 'C Product');
      const s = await session(bookerC.email);
      await t.prisma.organization.update({ where: { id: orgC.id }, data: { status: 'SUSPENDED' } });
      const res = await order(s.accessToken, {
        shopId: shopC.id,
        items: [{ productId: productC.id, quantity: 1 }],
        clientOrderId: randomUUID(),
      });
      expect([401, 403]).toContain(res.status);
      expect(await orderCount({ organizationId: orgC.id })).toBe(0);
      const refresh = await http()
        .post('/api/auth/mobile/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      expect(refresh.body.message).toBe('Your organization is suspended');
    });
  });
});
