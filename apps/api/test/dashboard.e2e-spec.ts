import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };

describe('Dashboard (e2e)', () => {
  let t: TestApp;
  let adminToken: string;
  let adminBToken: string;
  let bookerToken: string;
  let bilal: Id;
  let ideal: Id;
  let tin: Id;
  let pouchLiters: Id;
  let mlTin: Id;
  let gramTin: Id;
  let unweighed: Id;
  let fuel: Id;
  let monthStart: string;
  let previousMonth: string;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const dashboard = (token = adminToken) => http().get('/api/dashboard/summary').set(auth(token));
  const post = (url: string, body: object, token = adminToken) =>
    http().post(`/api/${url}`).set(auth(token)).send(body);
  const line = (p: Id, qty: number, tradePrice: string, gstRate = '0') => ({
    productId: p.id,
    ...(p === pouchLiters ? { qtyCtn: qty } : { qtyPcs: qty }),
    retailPrice: tradePrice,
    tradePrice,
    gstRate,
  });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    const orgA = await createOrganization(t.prisma, { name: 'Org A' });
    const orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    const booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const saddar = await f.area(orgA.id, 'Saddar');
    bilal = await f.shop(orgA.id, 'Bilal Store', saddar.id, booker.id);
    ideal = await f.shop(orgA.id, 'Ideal Store', saddar.id, booker.id);
    // TIN, 4.5 kg per piece, cost 2,000
    tin = await f.product(orgA.id, 'Ghee Tin', true, null, 'TIN');
    await t.prisma.product.update({ where: { id: tin.id }, data: { invoiceCostPrice: '2000' } });
    // POUCH weighed in liters (5 L per carton), cost 1,000
    pouchLiters = await f.product(orgA.id, 'Oil Pouch', true, null, 'POUCH');
    await t.prisma.product.update({
      where: { id: pouchLiters.id },
      data: { weight: '5', weightUnit: 'LITER', weightBasis: 'CARTON', invoiceCostPrice: '1000' },
    });
    // 500 ML per piece and 250 g per piece, priced at 0 so they only add weight
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
    adminToken = (await login(t.app, admin.email)).accessToken;
    bookerToken = (await login(t.app, booker.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;
  });

  afterAll(() => t.close());

  it('an organization with no activity gets zeros everywhere', async () => {
    const res = await dashboard().expect(200);
    monthStart = res.body.period.from;
    const d = new Date(`${monthStart}T00:00:00Z`);
    d.setUTCDate(0);
    previousMonth = d.toISOString().slice(0, 10); // last day of the previous month
    expect(res.body).toMatchObject({
      pendingOrders: 0,
      marketCredit: '0.00',
      shopsWithBalance: 0,
      monthlySales: '0.00',
      monthlyInvoiceCount: 0,
      monthlyWeightKg: '0.000',
      monthlyWeightTons: '0.000',
      monthlyExpenses: '0.00',
      monthlyGrossProfit: '0.00',
      monthlyNetProfit: '0.00',
      monthlyCashCollected: '0.00',
      topShops: [],
      recentPendingOrders: [],
    });
    expect(res.body.salesByMonth).toHaveLength(6);
    expect(res.body.salesByMonth.every((m: { sales: string }) => m.sales === '0.00')).toBe(true);
    expect(res.body.salesByMonth[5].month).toBe(monthStart.slice(0, 7));
  });

  describe('with activity this month', () => {
    let res: request.Response;

    beforeAll(async () => {
      // Bilal: 2 TIN (5,000 → payable 5,100 with advance tax), weight 9 kg; cost 4,000
      await post('invoices', {
        shopId: bilal.id,
        invoiceDate: monthStart,
        items: [line(tin, 2, '2500'), line(unweighed, 1, '0.50')],
        advanceTax: '99.50',
        duePayment: '123456', // never counts
      }).expect(201);
      // Ideal: 1 POUCH ctn of 5 L (1,100; cost 1,000) = 5 kg, 5 × 500 ML = 2.5 kg, 2 × 250 g = 0.5 kg
      await post('invoices', {
        shopId: ideal.id,
        invoiceDate: monthStart,
        items: [line(pouchLiters, 1, '1100'), line(mlTin, 5, '0'), line(gramTin, 2, '0')],
      }).expect(201);
      // cancelled invoice: excluded from sales, weight and profit (its reversal is not cash)
      const cancelled = await post('invoices', {
        shopId: ideal.id,
        invoiceDate: monthStart,
        items: [line(tin, 10, '2500')],
      }).expect(201);
      await post(`invoices/${cancelled.body.id}/cancel`, { reason: 'Returned' }).expect(200);
      // previous month: only in the sales chart
      await post('invoices', {
        shopId: bilal.id,
        invoiceDate: previousMonth,
        items: [line(tin, 1, '777.77')],
      }).expect(201);
      // cash: one payment; an adjustment decrease is not cash
      await post(`shops/${bilal.id}/payments`, { amount: '1000', paymentDate: monthStart }).expect(
        201,
      );
      await post(`shops/${ideal.id}/adjustments`, {
        direction: 'DECREASE',
        amount: '100',
        adjustmentDate: monthStart,
        reason: 'Rounding',
      }).expect(201);
      // expenses: active counts, voided does not
      await post('expenses', {
        categoryId: fuel.id,
        amount: '500',
        expenseDate: monthStart,
      }).expect(201);
      const voided = await post('expenses', {
        categoryId: fuel.id,
        amount: '200',
        expenseDate: monthStart,
      }).expect(201);
      await post(`expenses/${voided.body.id}/void`, { reason: 'Duplicate' }).expect(200);
      // orders: 2 pending, 1 cancelled
      const order = (shop: Id) =>
        post(
          'orders',
          { shopId: shop.id, items: [{ productId: tin.id, quantity: 1 }] },
          bookerToken,
        ).expect(201);
      await order(bilal);
      await order(ideal);
      const gone = await order(bilal);
      await post(`orders/${gone.body.id}/cancel`, {}, bookerToken).expect(200);

      res = await dashboard().expect(200);
    });

    it('counts pending orders and lists the newest ones', () => {
      expect(res.body.pendingOrders).toBe(2);
      expect(res.body.recentPendingOrders).toHaveLength(2);
      expect(
        res.body.recentPendingOrders.every((o: { status: string }) => o.status === 'PENDING'),
      ).toBe(true);
      expect(res.body.recentPendingOrders[0]).toMatchObject({
        itemCount: 1,
        area: { name: 'Saddar' },
      });
    });

    it('This Month Sales = Σ Payable Value of confirmed invoices (cancelled excluded)', () => {
      // 5,000.50 + 99.50 advance tax = 5,100.00 ; + 1,100.00
      expect(res.body).toMatchObject({ monthlySales: '6200.00', monthlyInvoiceCount: 2 });
    });

    it('weight sold = KG + Gram/1000 + Liter (1 L = 1 kg) + ML/1000, in tons; no-weight items skipped', () => {
      // 9 kg (2 TIN × 4.5 kg) + 5 L + 2.5 L (5 × 500 ML) + 0.5 kg (2 × 250 g) = 17 kg = 0.017 t
      expect(res.body).toMatchObject({ monthlyWeightKg: '17.000', monthlyWeightTons: '0.017' });
      expect(res.body).not.toHaveProperty('monthlyVolumeLiters');
    });

    it('Cash Collected counts PAYMENT entries only (no adjustments, no invoice reversals)', () => {
      expect(res.body.monthlyCashCollected).toBe('1000.00');
    });

    it('This Month Expenses excludes voided expenses', () => {
      expect(res.body.monthlyExpenses).toBe('500.00');
    });

    it('Gross / Net Profit are exactly /profit/summary for the month', async () => {
      const profit = await http()
        .get(`/api/profit/summary?from=${res.body.period.from}&to=${res.body.period.to}`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.monthlyGrossProfit).toBe(profit.body.grossProfit);
      expect(res.body.monthlyNetProfit).toBe(profit.body.netProfit);
      expect(res.body.monthlySales).toBe(profit.body.payableValue);
      // 6,200 − (4,000 + 10 + 1,000) = 1,190 ; − 500 expenses = 690
      expect(profit.body).toMatchObject({ grossProfit: '1190.00', netProfit: '690.00' });
    });

    it('Total Market Credit = Σ Shop Ledger balances (same as the ledger endpoint)', async () => {
      const ledger = await http()
        .get('/api/ledger/market-credit')
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.marketCredit).toBe(ledger.body.marketCredit);
      // Bilal 5,100 + 777.77 − 1,000 = 4,877.77 ; Ideal 1,100 − 100 = 1,000 (cancelled invoice reversed)
      expect(res.body).toMatchObject({ marketCredit: '5877.77', shopsWithBalance: 2 });
    });

    it('the sales chart covers 6 months, oldest first, with this and last month', () => {
      const months = res.body.salesByMonth as { month: string; sales: string }[];
      expect(months).toHaveLength(6);
      expect(months[5]).toEqual({ month: monthStart.slice(0, 7), sales: '6200.00' });
      expect(months[4]).toEqual({ month: previousMonth.slice(0, 7), sales: '777.77' });
    });

    it('top shops by this month Payable Value', () => {
      expect(res.body.topShops).toEqual([
        { shop: { id: bilal.id, name: 'Bilal Store' }, sales: '5100.00', invoiceCount: 1 },
        { shop: { id: ideal.id, name: 'Ideal Store' }, sales: '1100.00', invoiceCount: 1 },
      ]);
    });
  });

  it('is Admin-only', async () => {
    await dashboard(bookerToken).expect(403);
    await http().get('/api/dashboard/summary').expect(401);
  });

  it('Organization B never sees Organization A metrics', async () => {
    const res = await dashboard(adminBToken).expect(200);
    expect(res.body).toMatchObject({
      pendingOrders: 0,
      marketCredit: '0.00',
      monthlySales: '0.00',
      monthlyWeightKg: '0.000',
      monthlyExpenses: '0.00',
      monthlyNetProfit: '0.00',
      monthlyCashCollected: '0.00',
      topShops: [],
      recentPendingOrders: [],
    });
    expect(res.body.salesByMonth.every((m: { sales: string }) => m.sales === '0.00')).toBe(true);
  });
});
