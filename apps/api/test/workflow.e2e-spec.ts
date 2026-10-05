import request from 'supertest';
import { createOrganizationWithAdmin } from '../scripts/lib/organizations';
import { login } from './utils/auth';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

/**
 * The whole MVP workflow through the HTTP API, as a real distributor would use it:
 * Organization → Area → Shop Category → Product → Shop → Order Booker → Order → Invoice → Ledger
 * → Payment → Area Ledger → Expense → Dashboard → Reports, checking at each step that every
 * screen that shows the same figure shows the same number.
 */
describe('MVP workflow (e2e)', () => {
  let t: TestApp;
  let admin: string;
  let booker: string;
  let today: string;
  const ids: Record<string, string> = {};

  const http = () => request(t.app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = admin) => http().get(`/api/${url}`).set(as(token));
  const post = (url: string, body: object, token = admin) =>
    http().post(`/api/${url}`).set(as(token)).send(body);
  const patch = (url: string, body: object, token = admin) =>
    http().patch(`/api/${url}`).set(as(token)).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(() => t.close());

  it('1. Organization: created by the CLI with its Admin, counters and expense categories', async () => {
    const { organization } = await createOrganizationWithAdmin(t.prisma, {
      name: 'Workflow Traders',
      invoicePrefix: 'W-',
      invoiceNumberDigits: 6,
      admin: { name: 'Owner', email: 'owner@workflow.test', password: 'Owner@12345' },
    });
    ids.org = organization.id;
    admin = (await login(t.app, 'owner@workflow.test', 'Owner@12345')).accessToken;
    const settings = await patch('organization/settings', {
      address: 'Main Bazaar',
      town: 'Abbottabad',
      phone: '0992-123456',
      ntn: '1234567-8',
    }).expect(200);
    expect(settings.body).toMatchObject({ name: 'Workflow Traders', currency: 'PKR' });
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: settings.body.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const categories = await get('expense-categories?pageSize=100').expect(200);
    expect(categories.body.items.map((c: { name: string }) => c.name)).toContain('Fuel');
  });

  it('2. Area and Shop Category', async () => {
    ids.area = (await post('areas', { name: 'Saddar' }).expect(201)).body.id;
    ids.category = (await post('shop-categories', { name: 'General Store' }).expect(201)).body.id;
  });

  it('3. Products: a TIN (pieces) and a POUCH (cartons, weighed in liters)', async () => {
    const tin = await post('products', {
      name: 'Ghee Tin 4.5kg',
      code: 'GT-45',
      type: 'TIN',
      retailPrice: '2600',
      tradePrice: '2500',
      invoiceCostPrice: '2300',
      defaultTaxRate: '18',
      weight: '4.5',
      weightUnit: 'KG',
      weightBasis: 'PIECE',
    }).expect(201);
    ids.tin = tin.body.id;
    const pouch = await post('products', {
      name: 'Oil Pouch 1L x 12',
      type: 'POUCH',
      retailPrice: '6000',
      tradePrice: '5500',
      invoiceCostPrice: '5000',
      defaultTaxRate: '18',
      weight: '12',
      weightUnit: 'LITER',
      weightBasis: 'CARTON',
      piecesPerCarton: 12,
    }).expect(201);
    ids.pouch = pouch.body.id;
  });

  it('4. Order Booker account, then a Shop assigned to them', async () => {
    const user = await post('users', {
      name: 'Ahmed',
      email: 'ahmed@workflow.test',
      password: 'Booker@12345',
    }).expect(201);
    ids.booker = user.body.id;
    expect(user.body.role).toBe('ORDER_BOOKER');
    const shop = await post('shops', {
      name: 'Bilal Store',
      areaId: ids.area,
      categoryId: ids.category,
      assignedOrderBookerId: ids.booker,
      phone: '0300-1111111',
    }).expect(201);
    ids.shop = shop.body.id;
    expect(shop.body).toMatchObject({ outstandingBalance: '0.00' });
    booker = (await login(t.app, 'ahmed@workflow.test', 'Booker@12345')).accessToken;
  });

  it('5. The booker sees only the assigned shop and no prices, and books an order', async () => {
    const shops = await get('booker/shops', booker).expect(200);
    expect(shops.body.items.map((s: { id: string }) => s.id)).toEqual([ids.shop]);
    const products = await get('booker/products', booker).expect(200);
    expect(JSON.stringify(products.body)).not.toMatch(/price|cost|tax/i);
    const order = await post(
      'orders',
      {
        shopId: ids.shop,
        items: [
          { productId: ids.tin, quantity: 10 },
          { productId: ids.pouch, quantity: 2 },
        ],
      },
      booker,
    ).expect(201);
    ids.order = order.body.id;
    expect(order.body.items.map((i: { quantityUnit: string }) => i.quantityUnit)).toEqual([
      'PIECE',
      'CARTON',
    ]);
    const pending = await get('orders?status=PENDING').expect(200);
    expect(pending.body.items.map((o: { id: string }) => o.id)).toContain(ids.order);
  });

  it('6. Invoice from the order: prefilled draft, server-calculated values, ledger debit', async () => {
    const draft = await get(`invoices/draft?orderId=${ids.order}`).expect(200);
    expect(draft.body.items.map((i: { qtyPcs: number }) => i.qtyPcs)).toEqual([10, 24]);
    const invoice = await post('invoices', {
      shopId: ids.shop,
      orderId: ids.order,
      invoiceDate: today,
      items: [
        // 10 pcs × 2,500 = 25,000 ; GST 18 % = 4,500 ; TO 5/kg × 45 kg = 225 → gross 29,275
        {
          productId: ids.tin,
          qtyPcs: 10,
          retailPrice: '2600',
          tradePrice: '2500',
          gstRate: '18',
          toRate: '5',
        },
        // 2 ctn × 5,500 = 11,000 ; GST 1,980 → 12,980 ; special discount 80 → gross 12,900
        {
          productId: ids.pouch,
          qtyCtn: 2,
          retailPrice: '6000',
          tradePrice: '5500',
          gstRate: '18',
          specialDiscount: '80',
        },
      ],
      advanceTax: '100',
      adtDiscount: '75',
      duePayment: '999',
      // never trusted: the server recomputes / assigns all of these
      grandTotal: '1',
      payableValue: '1',
      invoiceNumber: 'HACK-1',
      organizationId: '00000000-0000-0000-0000-000000000000',
    }).expect(201);
    ids.invoice = invoice.body.id;
    expect(invoice.body).toMatchObject({
      invoiceNumber: 'W-000001',
      grandTotal: '42175.00',
      payableValue: '42200.00', // 42,175 + 100 − 75
      duePayment: '999.00',
      order: { id: ids.order },
    });
    const order = await get(`orders/${ids.order}`).expect(200);
    expect(order.body.status).toBe('INVOICED');
    const ledger = await get(`shops/${ids.shop}/ledger`).expect(200);
    expect(ledger.body.balance.outstandingBalance).toBe('42200.00');
    expect(ledger.body.items).toEqual([
      expect.objectContaining({
        type: 'INVOICE',
        debit: '42200.00',
        runningBalance: '42200.00',
        invoice: expect.objectContaining({ id: ids.invoice }),
      }),
    ]);
    // Due Payment never reaches the ledger
    await post('invoices', {
      shopId: ids.shop,
      orderId: ids.order,
      invoiceDate: today,
      items: [{ productId: ids.tin, qtyPcs: 1, retailPrice: '1', tradePrice: '1', gstRate: '0' }],
    }).expect(409); // an order is invoiced once
  });

  it('7. Payment, adjustment and the Area Ledger collection sheet', async () => {
    await post(`shops/${ids.shop}/payments`, {
      amount: '20000.50',
      paymentDate: today,
      method: 'CASH',
    }).expect(201);
    await post(`shops/${ids.shop}/adjustments`, {
      direction: 'DECREASE',
      amount: '199.50',
      adjustmentDate: today,
      reason: 'Rounding agreed with the shop',
    }).expect(201);
    await post(`shops/${ids.shop}/payments`, { amount: '22000.01', paymentDate: today }).expect(
      422,
    ); // more than owed
    const shop = await get(`shops/${ids.shop}`).expect(200);
    expect(shop.body.outstandingBalance).toBe('22000.00');
    const sheet = await get(`ledger/areas/${ids.area}?date=${today}`).expect(200);
    expect(sheet.body.rows).toEqual([
      expect.objectContaining({
        openingBalance: '0.00',
        dayDebit: '42200.00',
        dayOtherCredit: '199.50',
        payments: '20000.50',
        closingBalance: '22000.00',
      }),
    ]);
  });

  it('8. Expenses: one active, one voided', async () => {
    const categories = await get('expense-categories?pageSize=100').expect(200);
    const fuel = categories.body.items.find((c: { name: string }) => c.name === 'Fuel');
    await post('expenses', { categoryId: fuel.id, amount: '1500.25', expenseDate: today }).expect(
      201,
    );
    const wrong = await post('expenses', {
      categoryId: fuel.id,
      amount: '700',
      expenseDate: today,
    }).expect(201);
    await post(`expenses/${wrong.body.id}/void`, { reason: 'Entered twice' }).expect(200);
  });

  it('9. Dashboard: every card agrees with the ledger, profit and expenses', async () => {
    const d = (await get('dashboard/summary').expect(200)).body;
    // cost: 10 × 2,300 + 2 × 5,000 = 33,000 ; gross 42,200 − 33,000 = 9,200 ; net − 1,500.25
    expect(d).toMatchObject({
      pendingOrders: 0,
      marketCredit: '22000.00',
      shopsWithBalance: 1,
      monthlySales: '42200.00',
      monthlyInvoiceCount: 1,
      monthlyCashCollected: '20000.50', // the decrease is not cash
      monthlyExpenses: '1500.25',
      monthlyGrossProfit: '9200.00',
      monthlyNetProfit: '7699.75',
      monthlyWeightKg: '69.000', // 10 × 4.5 kg + 2 × 12 L (1 L = 1 kg)
      monthlyWeightTons: '0.069',
    });
  });

  it('10. Reports reconcile with the dashboard, the ledger and each other', async () => {
    const d = (await get('dashboard/summary').expect(200)).body;
    const sales = (await get('reports/sales').expect(200)).body;
    const invoices = (await get('reports/invoices').expect(200)).body;
    const credit = (await get('reports/shop-credit').expect(200)).body;
    const products = (await get('reports/product-sales').expect(200)).body;
    const expenses = (await get('reports/expenses').expect(200)).body;
    const profit = (await get('reports/profit').expect(200)).body;
    const shops = (await get('reports/shops').expect(200)).body;

    expect(sales.totals).toMatchObject({
      payableValue: d.monthlySales,
      weightKg: d.monthlyWeightKg,
      weightTons: d.monthlyWeightTons,
    });
    expect(sales.rows[0]).toMatchObject({
      invoiceNumber: 'W-000001',
      area: { id: ids.area, name: 'Saddar' },
      orderBooker: { id: ids.booker, name: 'Ahmed' },
    });
    expect(invoices.totals).toMatchObject({
      grandTotal: '42175.00',
      advanceTax: '100.00',
      adtDiscount: '75.00',
      payableValue: d.monthlySales,
    });
    expect(credit.totals.outstanding).toBe(d.marketCredit);
    expect(credit.marketCredit).toBe(d.marketCredit);
    expect(credit.rows[0]).toMatchObject({ lastPaymentDate: today, lastInvoiceDate: today });
    expect(shops.totals.outstanding).toBe(d.marketCredit);
    expect(products.rows.map((r: { quantity: number; quantityUnit: string }) => r)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ quantity: 10, quantityUnit: 'PIECE', weightKg: '45.000' }),
        expect.objectContaining({ quantity: 2, quantityUnit: 'CARTON', weightKg: '24.000' }),
      ]),
    );
    // product profit subtotal + advance tax − ADT = gross profit (no proration)
    expect(products.reconciliation).toMatchObject({
      productProfit: '9175.00',
      advanceTax: '100.00',
      adtDiscount: '75.00',
      grossProfit: d.monthlyGrossProfit,
    });
    expect(expenses.totals).toMatchObject({ active: d.monthlyExpenses, voided: '700.00' });
    expect(profit.summary).toMatchObject({
      payableValue: d.monthlySales,
      grossProfit: d.monthlyGrossProfit,
      expenses: d.monthlyExpenses,
      netProfit: d.monthlyNetProfit,
    });
  });

  it('11. Cancelling the invoice reverses it everywhere, consistently', async () => {
    // The shop has paid part of the invoice, so the reversal would go negative: refused.
    await post(`invoices/${ids.invoice}/cancel`, { reason: 'Goods returned' }).expect(409);
    // Correct it as the docs say (Adjust Credit → Increase), then cancel.
    await post(`shops/${ids.shop}/adjustments`, {
      direction: 'INCREASE',
      amount: '20200.00',
      adjustmentDate: today,
      reason: 'Payment kept as advance for the returned goods',
    }).expect(201);
    await post(`invoices/${ids.invoice}/cancel`, { reason: 'Goods returned' }).expect(200);
    await post(`invoices/${ids.invoice}/cancel`, { reason: 'Goods returned' }).expect(409);

    const d = (await get('dashboard/summary').expect(200)).body;
    expect(d).toMatchObject({
      monthlySales: '0.00',
      monthlyGrossProfit: '0.00',
      monthlyNetProfit: '-1500.25',
      monthlyWeightKg: '0.000',
      monthlyCashCollected: '20000.50', // the payment is still cash received
      marketCredit: '0.00', // 42,200 − 20,000.50 − 199.50 + 20,200 − 42,200
    });
    const order = await get(`orders/${ids.order}`).expect(200);
    expect(order.body.status).toBe('INVOICED'); // the order stays invoiced (D-16)
    const ledger = await get(`shops/${ids.shop}/ledger`).expect(200);
    expect(ledger.body.items.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(['INVOICE', 'INVOICE_REVERSAL', 'PAYMENT', 'MANUAL_ADJUSTMENT']),
    );
    const reversal = ledger.body.items.find((e: { type: string }) => e.type === 'INVOICE_REVERSAL');
    expect(reversal.credit).toBe('42200.00');
    const invoices = (await get('reports/invoices').expect(200)).body;
    expect(invoices).toMatchObject({ cancelledCount: 1, totals: { payableValue: '0.00' } });
    const credit = (await get('reports/shop-credit?balance=all').expect(200)).body;
    expect(credit.rows[0]).toMatchObject({ outstanding: '0.00', lastInvoiceDate: null });
  });
});
