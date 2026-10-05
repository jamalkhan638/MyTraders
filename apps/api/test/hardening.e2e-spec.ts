import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../src/common/decorators/access.decorators';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };

interface Route {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  isPublic: boolean;
  roles: string[];
}

const METHODS: Partial<Record<RequestMethod, Route['method']>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
};

/** Every route of the running app, with its declared access (read from the decorators). */
function allRoutes(t: TestApp): Route[] {
  const discovery = t.app.get(DiscoveryService);
  const reflector = t.app.get(Reflector);
  const scanner = new MetadataScanner();
  const routes: Route[] = [];
  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype as (new (...args: never[]) => unknown) | undefined;
    if (!controller) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const prototype = controller.prototype as Record<string, (...args: unknown[]) => unknown>;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name];
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (path === undefined) continue;
      const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      if (!method) continue;
      const targets = [handler, controller];
      routes.push({
        method,
        path: `/api/${[base, path].filter((p) => p && p !== '/').join('/')}`.replace(/\/+/g, '/'),
        isPublic: reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ?? false,
        roles: reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [],
      });
    }
  }
  return routes;
}

const withIds = (path: string) => path.replace(/:[A-Za-z]+/g, () => randomUUID());

describe('MVP hardening (e2e)', () => {
  let t: TestApp;
  const tokens: Record<string, string> = {};
  const a: Record<string, string> = {}; // Organization A ids
  const b: Record<string, string> = {}; // Organization B ids
  let orgAId: string;
  let today: string;

  const http = () => request(t.app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const call = (method: Route['method'], url: string, token?: string, body: object = {}) => {
    const req = http()[method](url);
    if (token) req.set(as(token));
    return method === 'get' ? req : req.send(body);
  };
  const post = (url: string, body: object, token = tokens.adminA) =>
    http().post(`/api/${url}`).set(as(token)).send(body);
  const get = (url: string, token = tokens.adminA) => http().get(`/api/${url}`).set(as(token));
  const line = (productId: string, qtyPcs: number, tradePrice: string, extra: object = {}) => ({
    productId,
    qtyPcs,
    retailPrice: tradePrice,
    tradePrice,
    gstRate: '0',
    ...extra,
  });

  /** Everything Organization A owns, to prove an attack changed nothing. */
  const snapshotA = async () => {
    const where = { organizationId: orgAId };
    const tables = await Promise.all([
      t.prisma.area.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.shopCategory.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.product.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.shop.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.user.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.order.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.invoice.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.shopLedgerEntry.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.payment.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.expense.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.expenseCategory.findMany({ where, orderBy: { id: 'asc' } }),
      t.prisma.organizationCounter.findMany({ where, orderBy: { key: 'asc' } }),
    ]);
    return JSON.stringify(tables);
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    const orgA = await createOrganization(t.prisma, { name: 'Org A' });
    const orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const suspended = await createOrganization(t.prisma, { name: 'Gone', status: 'SUSPENDED' });
    orgAId = orgA.id;
    const users = {
      adminA: await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' }),
      bookerA: await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' }),
      adminB: await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' }),
      bookerB: await createUser(t.prisma, { organizationId: orgB.id, role: 'ORDER_BOOKER' }),
      superAdmin: await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' }),
    };
    for (const [key, user] of Object.entries(users)) {
      tokens[key] = (await login(t.app, user.email)).accessToken;
    }
    const suspendedAdmin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    tokens.suspended = (await login(t.app, suspendedAdmin.email)).accessToken;
    await t.prisma.user.update({
      where: { id: suspendedAdmin.id },
      data: { organizationId: suspended.id },
    }); // token now names the wrong / a suspended organization
    a.booker = users.bookerA.id;
    b.booker = users.bookerB.id;

    for (const [ids, org, booker] of [
      [a, orgA, users.bookerA],
      [b, orgB, users.bookerB],
    ] as const) {
      ids.area = (await f.area(org.id, 'Area')).id;
      ids.category = (
        await t.prisma.shopCategory.create({
          data: { organizationId: org.id, name: 'Cat', nameNormalized: 'cat' },
        })
      ).id;
      ids.shop = (await f.shop(org.id, 'Shop', ids.area, booker.id)).id;
      ids.product = (await f.product(org.id, 'Ghee')).id;
      ids.expenseCategory = (
        await t.prisma.expenseCategory.create({
          data: { organizationId: org.id, name: 'Fuel', nameNormalized: 'fuel' },
        })
      ).id;
    }
    const settings = await get('organization/settings').expect(200);
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: settings.body.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // Organization A activity: an invoiced order, a pending order, a payment, an expense
    const order = await post(
      'orders',
      { shopId: a.shop, items: [{ productId: a.product, quantity: 2 }] },
      tokens.bookerA,
    ).expect(201);
    a.order = order.body.id;
    a.invoice = (
      await post('invoices', {
        shopId: a.shop,
        orderId: a.order,
        invoiceDate: today,
        items: [line(a.product, 2, '1000')],
      }).expect(201)
    ).body.id;
    a.pendingOrder = (
      await post(
        'orders',
        { shopId: a.shop, items: [{ productId: a.product, quantity: 1 }] },
        tokens.bookerA,
      ).expect(201)
    ).body.id;
    await post(`shops/${a.shop}/payments`, { amount: '500', paymentDate: today }).expect(201);
    a.expense = (
      await post('expenses', {
        categoryId: a.expenseCategory,
        amount: '100',
        expenseDate: today,
      }).expect(201)
    ).body.id;
  });

  afterAll(() => t.close());

  describe('role / permission matrix (every route, read from the decorators)', () => {
    let routes: Route[];
    beforeAll(() => {
      routes = allRoutes(t);
    });

    it('covers every module', () => {
      expect(routes.length).toBeGreaterThan(60);
      const paths = routes.map((r) => r.path).join(' ');
      for (const segment of ['invoices', 'ledger', 'reports', 'expenses', 'orders', 'booker']) {
        expect(paths).toContain(`/${segment}`);
      }
    });

    it('anonymous requests get 401 on every non-public route', async () => {
      for (const route of routes.filter((r) => !r.isPublic)) {
        const res = await call(route.method, withIds(route.path));
        expect(`${route.method} ${route.path} → ${res.status}`).toBe(
          `${route.method} ${route.path} → 401`,
        );
      }
    });

    it.each(['bookerA', 'superAdmin'] as const)(
      '%s gets 403 on every route its role is not declared for, and passes the role check otherwise',
      async (who) => {
        const role = who === 'bookerA' ? 'ORDER_BOOKER' : 'SUPER_ADMIN';
        for (const route of routes.filter((r) => !r.isPublic)) {
          const res = await call(route.method, withIds(route.path), tokens[who]);
          const allowed = route.roles.includes(role);
          const verdict = allowed ? res.status !== 403 && res.status !== 401 : res.status === 403;
          expect(`${route.method} ${route.path} (${res.status}) ok=${verdict}`).toBe(
            `${route.method} ${route.path} (${res.status}) ok=true`,
          );
        }
      },
    );

    it('a token whose organization changed / is suspended is refused everywhere', async () => {
      for (const route of routes.filter((r) => !r.isPublic)) {
        const res = await call(route.method, withIds(route.path), tokens.suspended);
        expect(`${route.path} ${res.status}`).toBe(`${route.path} 401`);
      }
    });
  });

  describe('cross-tenant ID attacks (Organization B using Organization A ids)', () => {
    let before: string;
    beforeAll(async () => {
      before = await snapshotA();
    });

    it('reading A records by id → 404', async () => {
      const urls = [
        `areas/${a.area}`,
        `shop-categories/${a.category}`,
        `products/${a.product}`,
        `shops/${a.shop}`,
        `users/${a.booker}`,
        `orders/${a.order}`,
        `invoices/${a.invoice}`,
        `expenses/${a.expense}`,
        `expense-categories/${a.expenseCategory}`,
        `shops/${a.shop}/ledger`,
        `ledger/areas/${a.area}?date=${today}`,
        `invoices/draft?orderId=${a.pendingOrder}`,
        `invoices/draft?shopId=${a.shop}`,
      ];
      for (const url of urls) {
        const res = await get(url, tokens.adminB);
        expect(`${url} ${res.status}`).toBe(`${url} 404`);
      }
    });

    it('changing A records by id → 404', async () => {
      const attacks: [string, string, object][] = [
        ['patch', `areas/${a.area}`, { name: 'Pwned' }],
        ['patch', `shop-categories/${a.category}`, { name: 'Pwned' }],
        ['patch', `products/${a.product}`, { name: 'Pwned', tradePrice: '1' }],
        ['patch', `shops/${a.shop}`, { name: 'Pwned', isActive: false }],
        ['patch', `users/${a.booker}`, { isActive: false, password: 'Pwned@12345' }],
        ['patch', `expenses/${a.expense}`, { amount: '1' }],
        ['patch', `expense-categories/${a.expenseCategory}`, { name: 'Pwned' }],
        ['post', `orders/${a.pendingOrder}/cancel`, {}],
        ['post', `invoices/${a.invoice}/cancel`, { reason: 'Pwned invoice' }],
        ['post', `expenses/${a.expense}/void`, { reason: 'Pwned expense' }],
        ['post', `shops/${a.shop}/payments`, { amount: '1', paymentDate: today }],
        [
          'post',
          `shops/${a.shop}/adjustments`,
          { direction: 'INCREASE', amount: '1', adjustmentDate: today, reason: 'Pwned' },
        ],
      ];
      for (const [method, url, body] of attacks) {
        const res = await call(method as Route['method'], `/api/${url}`, tokens.adminB, body);
        expect(`${method} ${url} ${res.status}`).toBe(`${method} ${url} 404`);
      }
    });

    it('referencing A records inside B requests → rejected (404 / 422), nothing created', async () => {
      const attacks: [string, object, string?][] = [
        ['shops', { name: 'X', areaId: a.area }],
        ['shops', { name: 'X', areaId: b.area, categoryId: a.category }],
        ['shops', { name: 'X', areaId: b.area, assignedOrderBookerId: a.booker }],
        ['invoices', { shopId: a.shop, invoiceDate: today, items: [line(b.product, 1, '1')] }],
        ['invoices', { shopId: b.shop, invoiceDate: today, items: [line(a.product, 1, '1')] }],
        [
          'invoices',
          {
            shopId: b.shop,
            orderId: a.pendingOrder,
            invoiceDate: today,
            items: [line(b.product, 1, '1')],
          },
        ],
        [
          'invoices/preview',
          { shopId: b.shop, invoiceDate: today, items: [line(a.product, 1, '1')] },
        ],
        ['expenses', { categoryId: a.expenseCategory, amount: '1', expenseDate: today }],
        [
          'orders',
          { shopId: a.shop, items: [{ productId: b.product, quantity: 1 }] },
          tokens.bookerB,
        ],
        [
          'orders',
          { shopId: b.shop, items: [{ productId: a.product, quantity: 1 }] },
          tokens.bookerB,
        ],
      ];
      const countsB = async () =>
        JSON.stringify(
          await Promise.all([
            t.prisma.shop.count({ where: { organizationId: { not: orgAId } } }),
            t.prisma.invoice.count({ where: { organizationId: { not: orgAId } } }),
            t.prisma.order.count({ where: { organizationId: { not: orgAId } } }),
            t.prisma.expense.count({ where: { organizationId: { not: orgAId } } }),
          ]),
        );
      const beforeB = await countsB();
      for (const [url, body, token] of attacks) {
        const res = await post(url, body, token ?? tokens.adminB);
        expect([404, 422]).toContain(res.status);
      }
      expect(await countsB()).toBe(beforeB);
    });

    it("a booker of A cannot reach another booker's or organization's orders", async () => {
      await get(`orders/${a.order}`, tokens.bookerB).expect(404);
      await post(`orders/${a.pendingOrder}/cancel`, {}, tokens.bookerB).expect(404);
      await get(`booker/shops/${a.shop}`, tokens.bookerB).expect(404);
    });

    it('Organization A data is byte-for-byte unchanged after every attack', async () => {
      expect(await snapshotA()).toBe(before);
    });
  });

  describe('financial atomicity and duplicate protection', () => {
    it('5 simultaneous cancels of one invoice: exactly one reversal', async () => {
      const shop = (await post('shops', { name: 'Cancel Shop', areaId: a.area }).expect(201)).body;
      const invoice = (
        await post('invoices', {
          shopId: shop.id,
          invoiceDate: today,
          items: [line(a.product, 3, '100')],
        }).expect(201)
      ).body;
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          post(`invoices/${invoice.id}/cancel`, { reason: 'Double click' }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
      const entries = await t.prisma.shopLedgerEntry.findMany({ where: { invoiceId: invoice.id } });
      expect(entries.map((e) => e.type).sort()).toEqual(['INVOICE', 'INVOICE_REVERSAL']);
      expect((await get(`shops/${shop.id}`).expect(200)).body.outstandingBalance).toBe('0.00');
    });

    it('a payment racing a cancellation never leaves a negative balance', async () => {
      const shop = (await post('shops', { name: 'Race Shop', areaId: a.area }).expect(201)).body;
      const invoice = (
        await post('invoices', {
          shopId: shop.id,
          invoiceDate: today,
          items: [line(a.product, 1, '1000')],
        }).expect(201)
      ).body;
      const [pay, cancel] = await Promise.all([
        post(`shops/${shop.id}/payments`, { amount: '1000', paymentDate: today }),
        post(`invoices/${invoice.id}/cancel`, { reason: 'Race condition' }),
      ]);
      // exactly one of them can win; the other is refused
      expect([pay.status, cancel.status].sort()).toEqual(
        pay.status === 201 ? [201, 409] : [200, 422],
      );
      expect((await get(`shops/${shop.id}`).expect(200)).body.outstandingBalance).toBe('0.00');
    });

    it('simultaneous decreases cannot take a shop below zero', async () => {
      const shop = (await post('shops', { name: 'Decrease Shop', areaId: a.area }).expect(201))
        .body;
      await post('invoices', {
        shopId: shop.id,
        invoiceDate: today,
        items: [line(a.product, 1, '100')],
      }).expect(201);
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          post(`shops/${shop.id}/adjustments`, {
            direction: 'DECREASE',
            amount: '40',
            adjustmentDate: today,
            reason: 'Parallel',
          }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect((await get(`shops/${shop.id}`).expect(200)).body.outstandingBalance).toBe('20.00');
    });

    it('a failed invoice writes nothing: no invoice, no number used, no debit, order stays pending', async () => {
      const before = await snapshotA();
      // second line has an unknown product → the whole confirmation rolls back
      await post('invoices', {
        shopId: a.shop,
        orderId: a.pendingOrder,
        invoiceDate: today,
        items: [line(a.product, 1, '10'), line(randomUUID(), 1, '10')],
      }).expect(422);
      // a value too large for its column is refused before anything is written (not a 500)
      const overflow = await post('invoices', {
        shopId: a.shop,
        orderId: a.pendingOrder,
        invoiceDate: today,
        items: [line(a.product, 100_000, '999999999999.99')],
      }).expect(422);
      expect(overflow.body.details).toEqual([
        { path: 'items.0', message: 'Line 1: the quantity or price is too large' },
      ]);
      await post('invoices/preview', {
        shopId: a.shop,
        invoiceDate: today,
        items: Array.from({ length: 200 }, () => line(a.product, 1, '999999999999.99')),
      }).expect(422);
      expect(await snapshotA()).toBe(before);
    });
  });

  describe('decimal precision', () => {
    it('cents add up exactly (no floating point anywhere)', async () => {
      const shop = (await post('shops', { name: 'Cents Shop', areaId: a.area }).expect(201)).body;
      const invoice = (
        await post('invoices', {
          shopId: shop.id,
          invoiceDate: today,
          items: [
            line(a.product, 1, '0.10'),
            line(a.product, 1, '0.20'),
            line(a.product, 3, '0.10', { gstRate: '18' }), // 0.30 + 0.054 → 0.05 (half up)
            line(a.product, 1, '0.01', { gstRate: '50' }), // 0.005 → 0.01 (half up)
          ],
        }).expect(201)
      ).body;
      expect(invoice).toMatchObject({ grandTotal: '0.67', payableValue: '0.67' });
      for (const amount of ['0.10', '0.20', '0.30']) {
        await post(`shops/${shop.id}/payments`, { amount, paymentDate: today }).expect(201);
      }
      expect((await get(`shops/${shop.id}`).expect(200)).body.outstandingBalance).toBe('0.07');
      await post(`shops/${shop.id}/payments`, { amount: '0.08', paymentDate: today }).expect(422);
      await post(`shops/${shop.id}/payments`, { amount: '0.07', paymentDate: today }).expect(201);
      expect((await get(`shops/${shop.id}`).expect(200)).body.outstandingBalance).toBe('0.00');
    });

    it('the largest allowed amounts are stored and returned exactly', async () => {
      const shop = (await post('shops', { name: 'Big Shop', areaId: a.area }).expect(201)).body;
      const invoice = (
        await post('invoices', {
          shopId: shop.id,
          invoiceDate: today,
          items: [line(a.product, 1, '999999999998.99')],
          advanceTax: '1.00',
        }).expect(201)
      ).body;
      expect(invoice.payableValue).toBe('999999999999.99');
      const balance = (await get(`shops/${shop.id}`).expect(200)).body.outstandingBalance;
      expect(balance).toBe('999999999999.99');
      // sums above a single column (market credit, report totals) stay exact as well
      const credit = (await get('ledger/market-credit').expect(200)).body.marketCredit;
      expect(new Prisma.Decimal(credit).greaterThan('999999999999.99')).toBe(true);
      expect(credit).toMatch(/^\d+\.\d{2}$/);
    });

    it('amounts with more than 2 decimals or in exponent form are refused', async () => {
      for (const amount of ['1.005', '1e3', '-5', '0', '1,000', '12.']) {
        const res = await post(`shops/${a.shop}/payments`, { amount, paymentDate: today });
        expect(`${amount} → ${res.status}`).toBe(`${amount} → 400`);
      }
    });
  });

  describe('snapshots and append-only records', () => {
    it('a confirmed invoice never changes when products, shops, areas or settings change', async () => {
      const original = (await get(`invoices/${a.invoice}`).expect(200)).body;
      await http()
        .patch(`/api/products/${a.product}`)
        .set(as(tokens.adminA))
        .send({ name: 'Renamed', tradePrice: '1', invoiceCostPrice: '1', weight: '9' })
        .expect(200);
      await http()
        .patch(`/api/shops/${a.shop}`)
        .set(as(tokens.adminA))
        .send({ name: 'Renamed Shop', phone: '000' })
        .expect(200);
      await http()
        .patch(`/api/areas/${a.area}`)
        .set(as(tokens.adminA))
        .send({ name: 'Renamed Area' })
        .expect(200);
      await http()
        .patch('/api/organization/settings')
        .set(as(tokens.adminA))
        .send({ name: 'Renamed Org', invoicePrefix: 'Z-' })
        .expect(200);
      expect((await get(`invoices/${a.invoice}`).expect(200)).body).toEqual(original);
    });

    it('the database itself refuses to edit or delete invoices, items, ledger entries and payments', async () => {
      const attempts = [
        t.prisma.$executeRaw`UPDATE "Invoice" SET "grandTotal" = 1 WHERE "id" = ${a.invoice}::uuid`,
        t.prisma.$executeRaw`DELETE FROM "Invoice" WHERE "id" = ${a.invoice}::uuid`,
        t.prisma
          .$executeRaw`UPDATE "InvoiceItem" SET "tradePrice" = 1 WHERE "invoiceId" = ${a.invoice}::uuid`,
        t.prisma
          .$executeRaw`UPDATE "ShopLedgerEntry" SET "debitAmount" = 1 WHERE "invoiceId" = ${a.invoice}::uuid`,
        t.prisma
          .$executeRaw`DELETE FROM "ShopLedgerEntry" WHERE "organizationId" = ${orgAId}::uuid`,
        t.prisma
          .$executeRaw`UPDATE "Payment" SET "amount" = 1 WHERE "organizationId" = ${orgAId}::uuid`,
        t.prisma.$executeRaw`DELETE FROM "Expense" WHERE "id" = ${a.expense}::uuid`,
      ];
      for (const attempt of attempts) {
        await expect(attempt).rejects.toThrow();
      }
    });
  });

  describe('ledger consistency (invariants over everything above)', () => {
    it('every balance is derived from entries that match their source documents', async () => {
      const where = { organizationId: orgAId };
      const [invoices, entries, payments] = await Promise.all([
        t.prisma.invoice.findMany({ where }),
        t.prisma.shopLedgerEntry.findMany({ where }),
        t.prisma.payment.findMany({ where }),
      ]);
      // one INVOICE debit per invoice with a Payable Value, equal to it
      for (const invoice of invoices) {
        const debits = entries.filter((e) => e.invoiceId === invoice.id && e.type === 'INVOICE');
        expect(debits).toHaveLength(invoice.payableValue.greaterThan(0) ? 1 : 0);
        if (debits[0]) expect(debits[0].debitAmount.equals(invoice.payableValue)).toBe(true);
        const reversals = entries.filter(
          (e) => e.invoiceId === invoice.id && e.type === 'INVOICE_REVERSAL',
        );
        expect(reversals).toHaveLength(invoice.status === 'CANCELLED' && debits[0] ? 1 : 0);
        if (reversals[0])
          expect(reversals[0].creditAmount.equals(debits[0].debitAmount)).toBe(true);
      }
      // payments ↔ PAYMENT entries, one to one, same amount and date
      const paymentEntries = entries.filter((e) => e.type === 'PAYMENT');
      expect(paymentEntries).toHaveLength(payments.length);
      for (const p of payments) {
        const e = paymentEntries.find((x) => x.paymentId === p.id)!;
        expect(e.creditAmount.equals(p.amount)).toBe(true);
        expect(e.transactionDate).toEqual(p.paymentDate);
      }
      // no shop is negative; market credit = Σ balances = dashboard = shop-credit report
      const balances = new Map<string, Prisma.Decimal>();
      for (const e of entries) {
        balances.set(
          e.shopId,
          (balances.get(e.shopId) ?? new Prisma.Decimal(0))
            .plus(e.debitAmount)
            .minus(e.creditAmount),
        );
      }
      for (const balance of balances.values()) expect(balance.isNegative()).toBe(false);
      const total = [...balances.values()].reduce((s, v) => s.plus(v), new Prisma.Decimal(0));
      const market = (await get('ledger/market-credit').expect(200)).body.marketCredit;
      const dashboard = (await get('dashboard/summary').expect(200)).body.marketCredit;
      const report = (await get('reports/shop-credit').expect(200)).body.totals.outstanding;
      expect([market, dashboard, report]).toEqual([
        total.toFixed(2),
        total.toFixed(2),
        total.toFixed(2),
      ]);
    });
  });

  describe('inactive / deactivated entities', () => {
    it('inactive shops and products cannot be ordered or invoiced; old debt can still be collected', async () => {
      const shop = (
        await post('shops', {
          name: 'Closing Shop',
          areaId: a.area,
          assignedOrderBookerId: a.booker,
        }).expect(201)
      ).body;
      await post('invoices', {
        shopId: shop.id,
        invoiceDate: today,
        items: [line(a.product, 1, '50')],
      }).expect(201);
      await http()
        .patch(`/api/shops/${shop.id}`)
        .set(as(tokens.adminA))
        .send({ isActive: false })
        .expect(200);
      await post('invoices', {
        shopId: shop.id,
        invoiceDate: today,
        items: [line(a.product, 1, '50')],
      }).expect(422);
      await post(
        'orders',
        { shopId: shop.id, items: [{ productId: a.product, quantity: 1 }] },
        tokens.bookerA,
      ).expect(422);
      await post(`shops/${shop.id}/payments`, { amount: '50', paymentDate: today }).expect(201);
      const product = (
        await post('products', {
          name: 'Old Product',
          type: 'TIN',
          retailPrice: '1',
          tradePrice: '1',
          invoiceCostPrice: '1',
          defaultTaxRate: '0',
        }).expect(201)
      ).body;
      await http()
        .patch(`/api/products/${product.id}`)
        .set(as(tokens.adminA))
        .send({ isActive: false })
        .expect(200);
      await post('invoices', {
        shopId: a.shop,
        invoiceDate: today,
        items: [line(product.id, 1, '1')],
      }).expect(422);
      await post(
        'orders',
        { shopId: a.shop, items: [{ productId: product.id, quantity: 1 }] },
        tokens.bookerA,
      ).expect(422);
      // still listed for history (Shop list report) with its status
      const list = (await get('reports/shops?status=inactive').expect(200)).body;
      expect(list.rows.map((r: { shop: Id }) => r.shop.id)).toContain(shop.id);
    });

    it('a deactivated booker is signed out at once; their pending order can still be invoiced', async () => {
      const booker = await createUser(t.prisma, { organizationId: orgAId, role: 'ORDER_BOOKER' });
      const token = (await login(t.app, booker.email)).accessToken;
      const shop = (
        await post('shops', {
          name: 'Booker Shop',
          areaId: a.area,
          assignedOrderBookerId: booker.id,
        }).expect(201)
      ).body;
      const order = (
        await post(
          'orders',
          { shopId: shop.id, items: [{ productId: a.product, quantity: 1 }] },
          token,
        ).expect(201)
      ).body;
      await http()
        .patch(`/api/users/${booker.id}`)
        .set(as(tokens.adminA))
        .send({ isActive: false })
        .expect(200);
      await get('booker/shops', token).expect(401);
      await http()
        .post('/api/auth/login')
        .send({ email: booker.email, password: 'Password@123' })
        .expect(401);
      await post('invoices', {
        shopId: shop.id,
        orderId: order.id,
        invoiceDate: today,
        items: [line(a.product, 1, '5')],
      }).expect(201);
    });

    it('inactive areas, categories and expense categories cannot be chosen for new records', async () => {
      const area = (await post('areas', { name: 'Closed Area' }).expect(201)).body;
      await http()
        .patch(`/api/areas/${area.id}`)
        .set(as(tokens.adminA))
        .send({ isActive: false })
        .expect(200);
      await post('shops', { name: 'X', areaId: area.id }).expect(422);
      const category = (await post('expense-categories', { name: 'Old Category' }).expect(201))
        .body;
      await http()
        .patch(`/api/expense-categories/${category.id}`)
        .set(as(tokens.adminA))
        .send({ isActive: false })
        .expect(200);
      await post('expenses', { categoryId: category.id, amount: '1', expenseDate: today }).expect(
        422,
      );
    });
  });

  describe('API errors', () => {
    it('malformed JSON → 400, too large body → 413, unknown route → 404, all in the standard shape', async () => {
      const bad = await http()
        .post('/api/expenses')
        .set(as(tokens.adminA))
        .set('Content-Type', 'application/json')
        .send('{"amount": ');
      expect(bad.status).toBe(400);
      const big = await post('expenses', { description: 'x'.repeat(2_000_000) });
      expect(big.body).toEqual({
        statusCode: 413,
        error: 'Payload Too Large',
        message: 'The request is too large',
      });
      const missing = await get('nope');
      expect(missing.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    });

    it('health reports the database status', async () => {
      await http().get('/api/health').expect(200, { status: 'ok' });
    });
  });
});
