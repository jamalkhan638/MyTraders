import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };

describe('Profit (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let adminToken: string;
  let adminBToken: string;
  let bookerToken: string;
  let shop: Id;
  let tin: Id;
  let pouch: Id;
  let fuel: Id;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const profit = (query: string, token = adminToken) =>
    http().get(`/api/profit/summary${query}`).set(auth(token));
  const invoice = (invoiceDate: string, items: object[], extra: object = {}) =>
    http()
      .post('/api/invoices')
      .set(auth(adminToken))
      .send({ shopId: shop.id, invoiceDate, items, ...extra })
      .expect(201);
  const tinLine = (qtyPcs: number) => ({
    productId: tin.id,
    qtyPcs,
    retailPrice: '2180',
    tradePrice: '2102.50',
    gstRate: '18',
  });
  const expense = (amount: string, expenseDate: string) =>
    http()
      .post('/api/expenses')
      .set(auth(adminToken))
      .send({ categoryId: fuel.id, amount, expenseDate })
      .expect(201);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    const orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    const booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const area = await f.area(orgA.id, 'Saddar');
    shop = await f.shop(orgA.id, 'Bilal Store', area.id, null);
    tin = await f.product(orgA.id, 'mbp 4.5Kg TIN', true, null, 'TIN');
    await t.prisma.product.update({
      where: { id: tin.id },
      data: { tradePrice: '2102.50', invoiceCostPrice: '2000' },
    });
    pouch = await f.product(orgA.id, 'mbp POUCH 1*5', true, null, 'POUCH');
    await t.prisma.product.update({
      where: { id: pouch.id },
      data: {
        tradePrice: '2102',
        invoiceCostPrice: '2050.25',
        weight: '4.5',
        weightUnit: 'KG',
        weightBasis: 'CARTON',
        piecesPerCarton: 5,
      },
    });
    fuel = await t.prisma.expenseCategory.create({
      data: { organizationId: orgA.id, name: 'Fuel', nameNormalized: 'fuel' },
    });
    adminToken = (await login(t.app, admin.email)).accessToken;
    bookerToken = (await login(t.app, booker.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;

    // September 2025
    // POUCH 2 ctn: gross 4,878.72, cost 2 × 2,050.25 = 4,100.50
    // TIN 3 pcs:   gross 7,442.85, cost 3 × 2,000.00 = 6,000.00
    await invoice(
      '2025-09-05',
      [
        {
          productId: pouch.id,
          qtyCtn: 2,
          retailPrice: '2180',
          tradePrice: '2102',
          gstRate: '18',
          toRate: '5',
          atoRate: '3',
          specialDiscount: '10',
        },
        tinLine(3),
      ],
      // Payable Value = 12,321.57 + 2,000 − 500 = 13,821.57; Due Payment never counts
      { advanceTax: '2000', adtDiscount: '500', duePayment: '99999' },
    );
    const cancelled = await invoice('2025-09-10', [tinLine(1)]);
    await http()
      .post(`/api/invoices/${cancelled.body.id}/cancel`)
      .set(auth(adminToken))
      .send({ reason: 'Returned' })
      .expect(200);
    await expense('1000.25', '2025-09-20');
    const voided = await expense('500', '2025-09-21');
    await http()
      .post(`/api/expenses/${voided.body.id}/void`)
      .set(auth(adminToken))
      .send({ reason: 'Duplicate' })
      .expect(200);
    // October 2025
    await invoice('2025-10-01', [tinLine(1)]);
  });

  afterAll(() => t.close());

  it('Gross Profit = Σ (Payable Value − product cost) of confirmed invoices; Net = Gross − expenses', async () => {
    const res = await profit('?from=2025-09-01&to=2025-09-30').expect(200);
    expect(res.body).toEqual({
      from: '2025-09-01',
      to: '2025-09-30',
      invoiceCount: 1, // the cancelled invoice is excluded
      payableValue: '13821.57',
      productCost: '10100.50',
      grossProfit: '3721.07',
      expenses: '1000.25', // the voided expense is excluded
      netProfit: '2720.82',
    });
  });

  it('uses the historical cost snapshot, not the current Invoice/Cost Price', async () => {
    await t.prisma.product.update({ where: { id: tin.id }, data: { invoiceCostPrice: '1' } });
    const res = await profit('?from=2025-09-01&to=2025-09-30').expect(200);
    expect(res.body.grossProfit).toBe('3721.07');
    await t.prisma.product.update({ where: { id: tin.id }, data: { invoiceCostPrice: '2000' } });
  });

  it('counts invoices and expenses by their own dates; Net Profit can be negative', async () => {
    const october = await profit('?from=2025-10-01&to=2025-10-31').expect(200);
    expect(october.body).toMatchObject({
      invoiceCount: 1,
      payableValue: '2480.95',
      productCost: '2000.00',
      grossProfit: '480.95',
      expenses: '0.00',
      netProfit: '480.95',
    });
    await expense('600.10', '2025-10-02');
    const after = await profit('?from=2025-10-01&to=2025-10-31').expect(200);
    expect(after.body.netProfit).toBe('-119.15');
  });

  describe('invoice-level values (one invoice per day: TIN 1 pc, Payable 2,480.95, cost 2,000)', () => {
    const day = async (date: string, extra: object) => {
      await invoice(date, [tinLine(1)], extra);
      return (await profit(`?from=${date}&to=${date}`).expect(200)).body;
    };

    it('a plain invoice: profit = 2,480.95 − 2,000 = 480.95', async () => {
      expect(await day('2025-11-01', {})).toMatchObject({
        payableValue: '2480.95',
        grossProfit: '480.95',
      });
    });

    it('Advance Tax increases profit', async () => {
      expect(await day('2025-11-02', { advanceTax: '100' })).toMatchObject({
        payableValue: '2580.95',
        grossProfit: '580.95',
      });
    });

    it('Further Tax increases profit', async () => {
      expect((await day('2025-11-03', { furtherTax: '50.50' })).grossProfit).toBe('531.45');
    });

    it('the ADT / invoice-level Special Discount reduces profit', async () => {
      expect((await day('2025-11-04', { adtDiscount: '80.95' })).grossProfit).toBe('400.00');
    });

    it('Due Payment does not affect profit', async () => {
      expect(await day('2025-11-05', { duePayment: '85000' })).toMatchObject({
        payableValue: '2480.95',
        grossProfit: '480.95',
      });
    });

    it('a cancelled invoice still counts for nothing', async () => {
      const inv = await invoice('2025-11-06', [tinLine(1)], { advanceTax: '100' });
      await http()
        .post(`/api/invoices/${inv.body.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Returned' })
        .expect(200);
      const res = await profit('?from=2025-11-06&to=2025-11-06').expect(200);
      expect(res.body).toMatchObject({ invoiceCount: 0, grossProfit: '0.00' });
    });

    it('the whole period adds up (480.95 + 580.95 + 531.45 + 400.00 + 480.95)', async () => {
      const res = await profit('?from=2025-11-01&to=2025-11-30').expect(200);
      expect(res.body).toMatchObject({ invoiceCount: 5, grossProfit: '2474.30' });
    });
  });

  it('defaults to the current month and validates the range', async () => {
    const res = await profit('').expect(200);
    expect(res.body.from).toMatch(/^\d{4}-\d{2}-01$/);
    await profit('?from=2025-10-02&to=2025-10-01').expect(400);
    await profit('?from=02-10-2025').expect(400);
  });

  it('is Admin-only and tenant isolated', async () => {
    await profit('', bookerToken).expect(403);
    await http().get('/api/profit/summary').expect(401);
    const b = await profit('?from=2025-09-01&to=2025-10-31', adminBToken).expect(200);
    expect(b.body).toMatchObject({ invoiceCount: 0, grossProfit: '0.00', netProfit: '0.00' });
  });
});
