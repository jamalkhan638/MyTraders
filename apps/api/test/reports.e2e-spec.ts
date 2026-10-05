import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };

const REPORTS = [
  'sales',
  'invoices',
  'shop-credit',
  'product-sales',
  'expenses',
  'profit',
  'shops',
] as const;

describe('Reports (e2e)', () => {
  let t: TestApp;
  let adminToken: string;
  let adminBToken: string;
  let bookerToken: string;
  let booker2Token: string;
  let superAdminToken: string;
  let booker: Id & { name: string; email: string };
  let saddar: Id;
  let cantt: Id;
  let bilal: Id;
  let ideal: Id;
  let canttMart: Id;
  let idle: Id;
  let tin: Id;
  let pouch: Id;
  let mlTin: Id;
  let gramTin: Id;
  let unweighed: Id;
  let fuel: Id;
  let salary: Id;
  let grocery: Id;
  let orgAId: string;
  let monthStart: string;
  let monthEnd: string;
  let previousMonth: string;
  let previousMonthStart: string;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const report = (name: string, query = '', token = adminToken) =>
    http().get(`/api/reports/${name}${query}`).set(auth(token));
  const post = (url: string, body: object, token = adminToken) =>
    http().post(`/api/${url}`).set(auth(token)).send(body);
  const line = (p: Id, qty: number, tradePrice: string) => ({
    productId: p.id,
    ...(p === pouch ? { qtyCtn: qty } : { qtyPcs: qty }),
    retailPrice: tradePrice,
    tradePrice,
    gstRate: '0',
  });
  const order = async (shop: Id, token: string) =>
    (
      await post(
        'orders',
        { shopId: shop.id, items: [{ productId: pouch.id, quantity: 1 }] },
        token,
      ).expect(201)
    ).body as Id;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    const orgA = await createOrganization(t.prisma, { name: 'Org A' });
    const orgB = await createOrganization(t.prisma, { name: 'Org B' });
    orgAId = orgA.id;
    const admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const booker2 = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const superAdmin = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });
    saddar = await f.area(orgA.id, 'Saddar');
    cantt = await f.area(orgA.id, 'Cantt');
    bilal = await f.shop(orgA.id, 'Bilal Store', saddar.id, booker.id);
    ideal = await f.shop(orgA.id, 'Ideal Store', saddar.id, booker.id);
    canttMart = await f.shop(orgA.id, 'Cantt Mart', cantt.id, booker2.id);
    idle = await f.shop(orgA.id, 'Idle Shop', cantt.id, null);
    grocery = await t.prisma.shopCategory.create({
      data: { organizationId: orgA.id, name: 'Grocery', nameNormalized: 'grocery' },
    });
    await t.prisma.shop.update({
      where: { id: bilal.id },
      data: { categoryId: grocery.id, phone: '0300-1234567' },
    });
    // TIN 4.5 kg / piece, cost 2,000
    tin = await f.product(orgA.id, 'Ghee Tin', true, 'GT-1', 'TIN');
    await t.prisma.product.update({ where: { id: tin.id }, data: { invoiceCostPrice: '2000' } });
    // POUCH weighed in liters: 5 L per carton (= 5 kg, D-35), cost 1,000
    pouch = await f.product(orgA.id, 'Oil Pouch', true, null, 'POUCH');
    await t.prisma.product.update({
      where: { id: pouch.id },
      data: { weight: '5', weightUnit: 'LITER', weightBasis: 'CARTON', invoiceCostPrice: '1000' },
    });
    mlTin = await f.product(orgA.id, 'Small Oil Bottle');
    await t.prisma.product.update({
      where: { id: mlTin.id },
      data: { weight: '500', weightUnit: 'ML', weightBasis: 'PIECE', invoiceCostPrice: '0' },
    });
    gramTin = await f.product(orgA.id, 'Ghee Sachet');
    await t.prisma.product.update({
      where: { id: gramTin.id },
      data: { weight: '250', weightUnit: 'GRAM', weightBasis: 'PIECE', invoiceCostPrice: '0' },
    });
    unweighed = await f.product(orgA.id, 'Loose Item');
    await t.prisma.product.update({
      where: { id: unweighed.id },
      data: { weight: null, weightUnit: null, weightBasis: null, invoiceCostPrice: '10' },
    });
    fuel = await t.prisma.expenseCategory.create({
      data: { organizationId: orgA.id, name: 'Fuel', nameNormalized: 'fuel' },
    });
    salary = await t.prisma.expenseCategory.create({
      data: { organizationId: orgA.id, name: 'Salary', nameNormalized: 'salary' },
    });
    adminToken = (await login(t.app, admin.email)).accessToken;
    bookerToken = (await login(t.app, booker.email)).accessToken;
    booker2Token = (await login(t.app, booker2.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;
    superAdminToken = (await login(t.app, superAdmin.email)).accessToken;

    const period = (await report('profit').expect(200)).body.summary;
    monthStart = period.from;
    monthEnd = period.to;
    const d = new Date(`${monthStart}T00:00:00Z`);
    d.setUTCDate(0);
    previousMonth = d.toISOString().slice(0, 10);
    previousMonthStart = `${previousMonth.slice(0, 7)}-01`;

    // 1. Bilal, direct: 2 TIN (5,000) + 0.50 unweighed, advance tax 99.50 → payable 5,100;
    //    9 kg; cost 4,010. Due Payment never counts anywhere.
    await post('invoices', {
      shopId: bilal.id,
      invoiceDate: monthStart,
      items: [line(tin, 2, '2500'), line(unweighed, 1, '0.50')],
      advanceTax: '99.50',
      duePayment: '123456',
    }).expect(201);
    // 2. Ideal, from booker 1's order: 1 ctn (5 L) + 5 × 500 ML + 2 × 250 g = 8 kg; 1,100; cost 1,000
    await post('invoices', {
      shopId: ideal.id,
      orderId: (await order(ideal, bookerToken)).id,
      invoiceDate: monthStart,
      items: [line(pouch, 1, '1100'), line(mlTin, 5, '0'), line(gramTin, 2, '0')],
    }).expect(201);
    // 3. Cantt Mart, from booker 2's order: 2 ctn = 10 kg; grand 2,200 + 50 − 200 = payable 2,050
    await post('invoices', {
      shopId: canttMart.id,
      orderId: (await order(canttMart, booker2Token)).id,
      invoiceDate: monthStart,
      items: [line(pouch, 2, '1100')],
      furtherTax: '50',
      adtDiscount: '200',
    }).expect(201);
    // 4. cancelled (Idle Shop): listed by the invoice report only, never counted
    const cancelled = await post('invoices', {
      shopId: idle.id,
      invoiceDate: monthStart,
      items: [line(tin, 10, '2500')],
    }).expect(201);
    await post(`invoices/${cancelled.body.id}/cancel`, { reason: 'Returned' }).expect(200);
    // 5. previous month: outside the default period
    await post('invoices', {
      shopId: bilal.id,
      invoiceDate: previousMonth,
      items: [line(tin, 1, '777.77')],
    }).expect(201);
    // ledger: one payment (cash) and one decrease (not cash)
    await post(`shops/${bilal.id}/payments`, { amount: '1000', paymentDate: monthStart }).expect(
      201,
    );
    await post(`shops/${ideal.id}/adjustments`, {
      direction: 'DECREASE',
      amount: '100',
      adjustmentDate: monthStart,
      reason: 'Rounding',
    }).expect(201);
    // expenses: 500 + 300 active, 200 voided this month; 999 last month
    const expense = (
      categoryId: string,
      amount: string,
      expenseDate: string,
      description?: string,
    ) => post('expenses', { categoryId, amount, expenseDate, description }).expect(201);
    await expense(fuel.id, '500', monthStart, 'Diesel');
    await expense(salary.id, '300', monthStart, 'Helper');
    const voided = await expense(fuel.id, '200', monthStart, 'Duplicate bill');
    await post(`expenses/${voided.body.id}/void`, { reason: 'Duplicate' }).expect(200);
    await expense(fuel.id, '999', previousMonth);
  });

  afterAll(() => t.close());

  describe('Sales report', () => {
    it('lists confirmed invoices with Payable Value and weight; totals = /profit/summary', async () => {
      const res = await report('sales').expect(200);
      expect(res.body.period).toEqual({ from: monthStart, to: monthEnd });
      expect(res.body.totals).toEqual({
        invoiceCount: 3,
        payableValue: '8250.00', // 5,100 + 1,100 + 2,050 (cancelled excluded)
        weightKg: '27.000', // 9 + (5 L + 2.5 L + 0.5 kg) + 10 L
        weightTons: '0.027',
      });
      expect(res.body).toMatchObject({ rowCount: 3, truncated: false });
      const profit = await http()
        .get(`/api/profit/summary?from=${monthStart}&to=${monthEnd}`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.totals.payableValue).toBe(profit.body.payableValue);
      const rows = res.body.rows as { shop: { name: string } }[];
      expect(rows.map((r) => r.shop.name).sort()).toEqual([
        'Bilal Store',
        'Cantt Mart',
        'Ideal Store',
      ]);
      expect(res.body.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            shop: { id: bilal.id, name: 'Bilal Store' },
            area: { id: saddar.id, name: 'Saddar' },
            orderBooker: null,
            payableValue: '5100.00',
            weightKg: '9.000',
          }),
          expect.objectContaining({
            shop: { id: ideal.id, name: 'Ideal Store' },
            orderBooker: { id: booker.id, name: booker.name },
            payableValue: '1100.00',
            weightKg: '8.000',
          }),
        ]),
      );
    });

    it('filters by area, shop, order booker and direct sale', async () => {
      const total = async (query: string) =>
        (await report('sales', query).expect(200)).body.totals.payableValue;
      expect(await total(`?areaId=${cantt.id}`)).toBe('2050.00');
      expect(await total(`?areaId=${saddar.id}`)).toBe('6200.00');
      expect(await total(`?shopId=${bilal.id}`)).toBe('5100.00');
      expect(await total(`?orderBookerId=${booker.id}`)).toBe('1100.00');
      expect(await total('?orderBookerId=direct')).toBe('5100.00');
      // a date range reaching last month adds its invoice
      expect(await total(`?from=${previousMonthStart}&to=${monthEnd}`)).toBe('9027.77');
    });

    it('rejects a reversed range and bad filters', async () => {
      await report('sales', `?from=${monthEnd}&to=${monthStart}`).expect(400);
      await report('sales', '?areaId=nope').expect(400);
      await report('sales', '?orderBookerId=someone').expect(400);
    });
  });

  describe('Invoice report', () => {
    it('lists confirmed and cancelled invoices; totals count confirmed only', async () => {
      const res = await report('invoices').expect(200);
      expect(res.body).toMatchObject({ rowCount: 4, cancelledCount: 1, truncated: false });
      expect(res.body.totals).toEqual({
        invoiceCount: 3,
        grandTotal: '8300.50',
        advanceTax: '99.50',
        furtherTax: '50.00',
        adtDiscount: '200.00',
        payableValue: '8250.00',
      });
      const cantt = res.body.rows.find((r: { shop: Id }) => r.shop.id === canttMart.id);
      expect(cantt).toMatchObject({
        status: 'CONFIRMED',
        grandTotal: '2200.00',
        advanceTax: null,
        furtherTax: '50.00',
        adtDiscount: '200.00',
        payableValue: '2050.00',
      });
      expect(cantt.id).toEqual(expect.any(String));
    });

    it('filters by status', async () => {
      const cancelled = await report('invoices', '?status=CANCELLED').expect(200);
      expect(cancelled.body.rows).toHaveLength(1);
      expect(cancelled.body.rows[0]).toMatchObject({
        status: 'CANCELLED',
        payableValue: '25000.00',
      });
      expect(cancelled.body.totals).toMatchObject({ invoiceCount: 0, payableValue: '0.00' });
      const confirmed = await report('invoices', '?status=CONFIRMED').expect(200);
      expect(confirmed.body).toMatchObject({ rowCount: 3, cancelledCount: 0 });
      expect(confirmed.body.totals.payableValue).toBe('8250.00');
      await report('invoices', '?status=DRAFT').expect(400);
    });
  });

  describe('Shop credit report', () => {
    it('owing shops by outstanding; total = Total Market Credit from the ledger', async () => {
      const res = await report('shop-credit').expect(200);
      // Bilal 5,100 + 777.77 − 1,000 ; Cantt Mart 2,050 ; Ideal 1,100 − 100 ; Idle 0 (reversed)
      expect(res.body.rows.map((r: { outstanding: string }) => r.outstanding)).toEqual([
        '4877.77',
        '2050.00',
        '1000.00',
      ]);
      expect(res.body.totals).toEqual({ outstanding: '7927.77', shopsOwing: 3 });
      const market = await http()
        .get('/api/ledger/market-credit')
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.marketCredit).toBe(market.body.marketCredit);
      expect(res.body.totals.outstanding).toBe(market.body.marketCredit);
      expect(res.body.rows[0]).toMatchObject({
        shop: { id: bilal.id, name: 'Bilal Store', isActive: true },
        area: { name: 'Saddar' },
        orderBooker: { id: booker.id },
        phone: '0300-1234567',
        lastPaymentDate: monthStart, // the PAYMENT; the adjustment on Ideal is not a payment
        lastInvoiceDate: monthStart,
      });
      expect(res.body.rows[2]).toMatchObject({ shop: { id: ideal.id }, lastPaymentDate: null });
    });

    it('balance=all includes zero balances; a cancelled invoice is not a last invoice', async () => {
      const res = await report('shop-credit', '?balance=all').expect(200);
      expect(res.body.rowCount).toBe(4);
      expect(res.body.rows[3]).toMatchObject({
        shop: { id: idle.id },
        outstanding: '0.00',
        lastInvoiceDate: null,
        orderBooker: null,
      });
    });

    it('filters by area, booker and search; market credit stays organization-wide', async () => {
      const area = await report('shop-credit', `?areaId=${cantt.id}`).expect(200);
      expect(area.body.rows.map((r: { shop: Id }) => r.shop.id)).toEqual([canttMart.id]);
      expect(area.body.totals.outstanding).toBe('2050.00');
      expect(area.body.marketCredit).toBe('7927.77');
      const unassigned = await report('shop-credit', '?orderBookerId=unassigned&balance=all');
      expect(unassigned.body.rows.map((r: { shop: Id }) => r.shop.id)).toEqual([idle.id]);
      const search = await report('shop-credit', '?q=ideal').expect(200);
      expect(search.body.rows.map((r: { shop: Id }) => r.shop.id)).toEqual([ideal.id]);
    });
  });

  describe('Product sales report', () => {
    it('quantities in pieces (TIN) and cartons (POUCH), weight by D-35, value, cost, profit', async () => {
      const res = await report('product-sales').expect(200);
      const byName = Object.fromEntries(
        res.body.rows.map((r: { product: { name: string } }) => [r.product.name, r]),
      );
      expect(byName['Ghee Tin']).toMatchObject({
        product: { id: tin.id, code: 'GT-1' },
        type: 'TIN',
        quantity: 2, // the cancelled invoice's 10 pieces are excluded
        quantityUnit: 'PIECE',
        weightKg: '9.000',
        salesValue: '5000.00',
        productCost: '4000.00',
        profit: '1000.00',
      });
      expect(byName['Oil Pouch']).toMatchObject({
        type: 'POUCH',
        quantity: 3,
        quantityUnit: 'CARTON',
        weightKg: '15.000', // 3 ctn × 5 L, 1 L = 1 kg
        salesValue: '3300.00',
        productCost: '3000.00',
        profit: '300.00',
      });
      expect(byName['Small Oil Bottle']).toMatchObject({ quantity: 5, weightKg: '2.500' });
      expect(byName['Ghee Sachet']).toMatchObject({ quantity: 2, weightKg: '0.500' });
      expect(byName['Loose Item']).toMatchObject({ weightKg: '0.000', profit: '-9.50' });
      expect(res.body.totals).toEqual({
        pieces: 10,
        cartons: 3,
        weightKg: '27.000',
        weightTons: '0.027',
        salesValue: '8300.50',
        productCost: '7010.00',
        profit: '1290.50',
      });
    });

    it('reconciles with Payable Value and the Profit report through invoice-level amounts', async () => {
      const res = await report('product-sales').expect(200);
      expect(res.body.invoiceLevel).toEqual({
        grandTotal: '8300.50',
        adjustments: '-50.50', // + 99.50 advance tax + 50 further tax − 200 ADT discount
        payableValue: '8250.00',
        grossProfit: '1240.00',
      });
      const profit = await report('profit').expect(200);
      expect(res.body.invoiceLevel.grossProfit).toBe(profit.body.summary.grossProfit);
    });

    it('filters by product, type and area', async () => {
      const product = await report('product-sales', `?productId=${tin.id}`).expect(200);
      expect(product.body.rows).toHaveLength(1);
      expect(product.body.invoiceLevel).toBeNull();
      const type = await report('product-sales', '?type=POUCH').expect(200);
      expect(type.body.rows.map((r: { type: string }) => r.type)).toEqual(['POUCH']);
      const area = await report('product-sales', `?areaId=${cantt.id}`).expect(200);
      expect(area.body.rows).toEqual([
        expect.objectContaining({ quantity: 2, quantityUnit: 'CARTON', salesValue: '2200.00' }),
      ]);
      expect(area.body.invoiceLevel.payableValue).toBe('2050.00');
    });
  });

  describe('Expense report', () => {
    it('lists active and voided; only active expenses make the total', async () => {
      const res = await report('expenses').expect(200);
      expect(res.body.rowCount).toBe(3);
      expect(res.body.totals).toEqual({
        active: '800.00',
        activeCount: 2,
        voided: '200.00',
        voidedCount: 1,
      });
      expect(res.body.byCategory).toEqual([
        { category: { id: fuel.id, name: 'Fuel' }, total: '500.00', count: 1 },
        { category: { id: salary.id, name: 'Salary' }, total: '300.00', count: 1 },
      ]);
      expect(res.body.rows.find((r: { status: string }) => r.status === 'VOIDED')).toMatchObject({
        amount: '200.00',
        voidReason: 'Duplicate',
        description: 'Duplicate bill',
      });
    });

    it('filters by status, category, search and date', async () => {
      const voided = await report('expenses', '?status=voided').expect(200);
      expect(voided.body.rows).toHaveLength(1);
      expect(voided.body.totals.active).toBe('0.00');
      const fuelOnly = await report('expenses', `?categoryId=${fuel.id}&status=active`);
      expect(fuelOnly.body.totals).toMatchObject({ active: '500.00', voidedCount: 0 });
      const search = await report('expenses', '?q=helper').expect(200);
      expect(search.body.rows.map((r: { amount: string }) => r.amount)).toEqual(['300.00']);
      const wide = await report('expenses', `?from=${previousMonthStart}&to=${monthEnd}`);
      expect(wide.body.totals.active).toBe('1799.00');
    });
  });

  describe('Profit report', () => {
    it('is exactly /profit/summary for the period, and per month', async () => {
      const res = await report('profit', `?from=${previousMonthStart}&to=${monthEnd}`).expect(200);
      const summary = await http()
        .get(`/api/profit/summary?from=${previousMonthStart}&to=${monthEnd}`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.summary).toEqual(summary.body);
      expect(res.body.byMonth).toHaveLength(2);
      expect(res.body.byMonth[0]).toMatchObject({
        month: previousMonth.slice(0, 7),
        payableValue: '777.77',
        productCost: '2000.00',
        grossProfit: '-1222.23',
        expenses: '999.00',
        netProfit: '-2221.23',
      });
      expect(res.body.byMonth[1]).toMatchObject({
        month: monthStart.slice(0, 7),
        payableValue: '8250.00',
        productCost: '7010.00',
        grossProfit: '1240.00', // Payable Value − cost (Due Payment never counts)
        expenses: '800.00', // voided excluded
        netProfit: '440.00',
      });
    });

    it('defaults to the current month', async () => {
      const res = await report('profit').expect(200);
      expect(res.body.summary).toMatchObject({
        from: monthStart,
        to: monthEnd,
        netProfit: '440.00',
      });
      expect(res.body.byMonth).toHaveLength(1);
    });
  });

  describe('Shop list report', () => {
    it('lists every shop area-wise with its current outstanding', async () => {
      const res = await report('shops').expect(200);
      expect(res.body.rows.map((r: { shop: { name: string } }) => r.shop.name)).toEqual([
        'Cantt Mart',
        'Idle Shop',
        'Bilal Store',
        'Ideal Store',
      ]);
      expect(res.body.totals).toEqual({ shopCount: 4, outstanding: '7927.77' });
      expect(res.body.rows[2]).toMatchObject({
        area: { name: 'Saddar' },
        category: { id: grocery.id, name: 'Grocery' },
        orderBooker: { id: booker.id },
        phone: '0300-1234567',
        outstanding: '4877.77',
        isActive: true,
      });
    });

    it('filters by area, search, category and status', async () => {
      const area = await report('shops', `?areaId=${saddar.id}`).expect(200);
      expect(area.body.totals).toEqual({ shopCount: 2, outstanding: '5877.77' });
      const search = await report('shops', '?q=bil').expect(200);
      expect(search.body.rows.map((r: { shop: Id }) => r.shop.id)).toEqual([bilal.id]);
      const category = await report('shops', `?categoryId=${grocery.id}`).expect(200);
      expect(category.body.rows).toHaveLength(1);
      const inactive = await report('shops', '?status=inactive').expect(200);
      expect(inactive.body.rows).toEqual([]);
    });
  });

  describe('permissions', () => {
    it.each(REPORTS)('/reports/%s is Admin-only', async (name) => {
      await report(name, '', bookerToken).expect(403);
      await report(name, '', superAdminToken).expect(403);
      await http().get(`/api/reports/${name}`).expect(401);
    });
  });

  describe('tenant isolation', () => {
    it.each(REPORTS)('Organization B sees none of Organization A in /reports/%s', async (name) => {
      const res = await report(name, '', adminBToken).expect(200);
      const text = JSON.stringify(res.body);
      for (const secret of ['Bilal', 'Ideal', 'Cantt', 'Ghee', 'Saddar', 'Diesel', '8250']) {
        expect(text).not.toContain(secret);
      }
      if (name !== 'profit') expect(res.body.rows).toEqual([]);
    });

    it("Organization A's ids as filters find nothing in Organization B", async () => {
      const sales = await report('sales', `?areaId=${saddar.id}&shopId=${bilal.id}`, adminBToken);
      expect(sales.body.totals).toMatchObject({ invoiceCount: 0, payableValue: '0.00' });
      const products = await report('product-sales', `?productId=${tin.id}`, adminBToken);
      expect(products.body.rows).toEqual([]);
      const credit = await report('shop-credit', `?areaId=${saddar.id}&balance=all`, adminBToken);
      expect(credit.body).toMatchObject({ rows: [], marketCredit: '0.00' });
      const expenses = await report('expenses', `?categoryId=${fuel.id}`, adminBToken);
      expect(expenses.body.totals.active).toBe('0.00');
    });

    it('an organizationId sent by the client is ignored', async () => {
      const res = await report('sales', `?organizationId=${orgAId}`, adminBToken).expect(200);
      expect(res.body.totals.invoiceCount).toBe(0);
      const shops = await report('shops', `?organizationId=${orgAId}`, adminBToken).expect(200);
      expect(shops.body.rows).toEqual([]);
    });
  });
});
