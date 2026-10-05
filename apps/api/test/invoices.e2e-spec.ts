import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };
type Res = request.Response;

describe('Invoices (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let orgB: Id;
  let adminA: Id & { email: string };
  let adminToken: string;
  let adminBToken: string;
  let bookerToken: string;
  let superToken: string;
  let shop: Id;
  let otherShop: Id;
  let closedShop: Id;
  let shopB: Id;
  let pouch: Id;
  let tin: Id;
  let unweighed: Id;
  let retired: Id;
  let productB: Id;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createInvoice = (body: object, token = adminToken) =>
    http().post('/api/invoices').set(auth(token)).send(body);
  const getInvoice = (id: string, token = adminToken) =>
    http().get(`/api/invoices/${id}`).set(auth(token));
  const list = (query = '', token = adminToken) =>
    http().get(`/api/invoices${query}`).set(auth(token));
  const draft = (query: string, token = adminToken) =>
    http().get(`/api/invoices/draft${query}`).set(auth(token));
  const cancel = (id: string, body: object, token = adminToken) =>
    http().post(`/api/invoices/${id}/cancel`).set(auth(token)).send(body);
  const details = (res: Res) => res.body.details as { path: string; message: string }[];

  /** A row with the product's own prices — the Admin may override any of these. */
  const pouchLine = (patch: object = {}) => ({
    productId: pouch.id,
    qtyCtn: 2,
    retailPrice: '2180',
    tradePrice: '2102',
    gstRate: '18',
    toRate: '5',
    atoRate: '3',
    specialDiscount: '10',
    ...patch,
  });
  const tinLine = (patch: object = {}) => ({
    productId: tin.id,
    qtyPcs: 3,
    retailPrice: '2180',
    tradePrice: '2102.50',
    gstRate: '18',
    toRate: '0',
    atoRate: '0',
    ...patch,
  });
  const invoice = (items: object[], patch: object = {}) => ({
    shopId: shop.id,
    invoiceDate: '2026-10-05',
    items,
    ...patch,
  });
  const nextNumber = async () =>
    (await draft(`?shopId=${shop.id}`).expect(200)).body.proposedInvoiceNumber as string;
  const bookOrder = async (items: [Id, number][], forShop: Id = shop) =>
    (
      await http()
        .post('/api/orders')
        .set(auth(bookerToken))
        .send({
          shopId: forShop.id,
          items: items.map(([p, quantity]) => ({ productId: p.id, quantity })),
        })
        .expect(201)
    ).body as { id: string; orderNumber: string };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Ali Akbar Traders' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    await t.prisma.organization.update({
      where: { id: orgA.id },
      data: {
        invoicePrefix: 'M-',
        invoiceNumberDigits: 8,
        address: 'Main Bazar',
        town: 'Abbottabad',
        phone: '0300-1111111',
        ntn: 'NTN-ORG',
        strn: 'STRN-ORG',
        defaultTaxRate: '18',
      },
    });

    adminA = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN', name: 'Owner' });
    const booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const superUser = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });

    const saddar = await f.area(orgA.id, 'Saddar');
    const areaB = await f.area(orgB.id, 'B Area');
    const category = await t.prisma.shopCategory.create({
      data: { organizationId: orgA.id, name: 'General Store', nameNormalized: 'general store' },
    });
    shop = await f.shop(orgA.id, 'Bilal Store', saddar.id, booker.id);
    await t.prisma.shop.update({
      where: { id: shop.id },
      data: {
        address: 'Supply Bazar',
        contactPerson: 'Bilal',
        phone: '0311-2222222',
        ntn: 'NTN-SHOP',
        strn: 'STRN-SHOP',
        cnic: '13101-1234567-1',
        categoryId: category.id,
      },
    });
    otherShop = await f.shop(orgA.id, 'Other Store', saddar.id, booker.id);
    closedShop = await f.shop(orgA.id, 'Closed Store', saddar.id, null, false);
    shopB = await f.shop(orgB.id, 'B Store', areaB.id, null);

    pouch = await f.product(orgA.id, 'mbp POUCH 1*5', true, '220000', 'POUCH');
    await t.prisma.product.update({
      where: { id: pouch.id },
      data: {
        retailPrice: '2180',
        tradePrice: '2102',
        invoiceCostPrice: '2050.25',
        weight: '4.5',
        weightUnit: 'KG',
        weightBasis: 'CARTON',
        piecesPerCarton: 5,
      },
    });
    tin = await f.product(orgA.id, 'mbp 4.5Kg TIN', true, '4000000164', 'TIN');
    await t.prisma.product.update({
      where: { id: tin.id },
      data: { retailPrice: '2180', tradePrice: '2102.50', invoiceCostPrice: '2000' },
    });
    unweighed = await f.product(orgA.id, 'No Weight Item');
    await t.prisma.product.update({
      where: { id: unweighed.id },
      data: { weight: null, weightUnit: null, weightBasis: null },
    });
    retired = await f.product(orgA.id, 'Retired Item', false);
    productB = await f.product(orgB.id, 'B Product');

    adminToken = (await login(t.app, adminA.email)).accessToken;
    bookerToken = (await login(t.app, booker.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;
    superToken = (await login(t.app, superUser.email)).accessToken;
  });

  afterAll(() => t.close());

  describe('direct shop invoice', () => {
    let first: Res;

    it('opens a draft for the shop with no rows, a proposed number and today', async () => {
      const res = await draft(`?shopId=${shop.id}`).expect(200);
      expect(res.body).toMatchObject({
        shop: { id: shop.id, name: 'Bilal Store', isActive: true, category: 'General Store' },
        order: null,
        proposedInvoiceNumber: 'M-00000001',
        // no ledger entries yet → nothing outstanding
        duePayment: '0.00',
        defaultTaxRate: '18',
        items: [],
      });
      expect(res.body.invoiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('confirms an invoice with the exact formulas (POUCH 2 ctn + TIN 3 pcs)', async () => {
      first = await createInvoice(
        invoice([pouchLine(), tinLine()], {
          duePayment: '85000',
          organizationId: orgB.id,
          invoiceNumber: 'HACK-1',
          grandTotal: '1.00',
          status: 'CANCELLED',
        }),
      ).expect(201);
      const body = first.body;
      expect(body).toMatchObject({
        invoiceNumber: 'M-00000001',
        invoiceDate: '2026-10-05',
        status: 'CONFIRMED',
        order: null,
        shop: { id: shop.id, name: 'Bilal Store' },
        itemCount: 2,
        currency: 'PKR',
        createdBy: { id: adminA.id, name: 'Owner' },
      });
      // POUCH: Qty Ctn prices; Qty Pcs = 2 × 5 for display.
      expect(body.items[0]).toMatchObject({
        lineNo: 1,
        productType: 'POUCH',
        qtyCtn: 2,
        qtyPcs: 10,
        totalWeight: '9.000',
        totalWeightUnit: 'KG',
        tradePrice: '2102.00',
        valueExclTax: '4204.00',
        gstRate: '18',
        gstAmount: '756.72',
        valueInclGst: '4960.72',
        toRate: '5',
        toAmount: '45.00',
        atoRate: '3',
        atoAmount: '27.00',
        specialDiscount: '10.00',
        totalTradeOffer: '82.00',
        grossValue: '4878.72',
      });
      // TIN: Qty Pcs prices; no cartons. 3 × 2102.50 = 6307.50; GST 1135.35; weight 13.5 kg.
      expect(body.items[1]).toMatchObject({
        productType: 'TIN',
        qtyCtn: null,
        qtyPcs: 3,
        totalWeight: '13.500',
        valueExclTax: '6307.50',
        gstAmount: '1135.35',
        valueInclGst: '7442.85',
        totalTradeOffer: '0.00',
        grossValue: '7442.85',
      });
      // Grand Total = Σ gross; client "grandTotal" / number / status / org ignored.
      expect(body).toMatchObject({
        totalValueExclTax: '10511.50',
        totalGstAmount: '1892.07',
        totalValueInclGst: '12403.57',
        totalTradeOffer: '82.00',
        grandTotal: '12321.57',
        duePayment: '85000.00',
      });
      const stored = await t.prisma.invoice.findUniqueOrThrow({ where: { id: body.id } });
      expect(stored.organizationId).toBe(orgA.id);
    });

    it('snapshots the shop and distributor header', () => {
      expect(first.body.shopSnapshot).toEqual({
        name: 'Bilal Store',
        address: 'Supply Bazar',
        phone: '0311-2222222',
        contactPerson: 'Bilal',
        ntn: 'NTN-SHOP',
        strn: 'STRN-SHOP',
        cnic: '13101-1234567-1',
        category: 'General Store',
        area: 'Saddar',
      });
      expect(first.body.distributor).toEqual({
        name: 'Ali Akbar Traders',
        address: 'Main Bazar',
        town: 'Abbottabad',
        phone: '0300-1111111',
        ntn: 'NTN-ORG',
        strn: 'STRN-ORG',
      });
    });

    it('snapshots product name, code, type, prices, cost and packing on each row', () => {
      expect(first.body.items[0]).toMatchObject({
        productId: pouch.id,
        productCode: '220000',
        productName: 'mbp POUCH 1*5',
        retailPrice: '2180.00',
        invoiceCostPrice: '2050.25',
        piecesPerCarton: 5,
        weight: '4.5',
        weightUnit: 'KG',
        weightBasis: 'CARTON',
        // cost = Qty Ctn × invoice/cost price — profit only
        costTotal: '4100.50',
      });
      expect(first.body.items[1]).toMatchObject({ costTotal: '6000.00' });
      expect(first.body.totalCost).toBe('10100.50');
      expect(JSON.stringify(first.body.items)).not.toMatch(/rateCode/i);
    });

    it('later product, shop and organization changes never alter the invoice', async () => {
      await t.prisma.product.update({
        where: { id: pouch.id },
        data: { name: 'Renamed', tradePrice: '9999', invoiceCostPrice: '1', piecesPerCarton: 6 },
      });
      await t.prisma.shop.update({ where: { id: shop.id }, data: { name: 'New Name', ntn: 'X' } });
      await t.prisma.organization.update({ where: { id: orgA.id }, data: { name: 'Renamed Org' } });
      const again = await getInvoice(first.body.id).expect(200);
      expect(again.body).toEqual(first.body);
      // restore for the tests below
      await t.prisma.product.update({
        where: { id: pouch.id },
        data: {
          name: 'mbp POUCH 1*5',
          tradePrice: '2102',
          invoiceCostPrice: '2050.25',
          piecesPerCarton: 5,
        },
      });
      await t.prisma.shop.update({
        where: { id: shop.id },
        data: { name: 'Bilal Store', ntn: 'NTN-SHOP' },
      });
      await t.prisma.organization.update({
        where: { id: orgA.id },
        data: { name: 'Ali Akbar Traders' },
      });
    });

    it('editing Due Payment changes nothing but the invoice snapshot', async () => {
      const shopBefore = await t.prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
      const ledgerBefore = (await draft(`?shopId=${shop.id}`)).body.duePayment as string;
      const res = await createInvoice(invoice([tinLine()], { duePayment: '80000' })).expect(201);
      expect(res.body.duePayment).toBe('80000.00');
      expect(res.body.grandTotal).toBe(
        (await createInvoice(invoice([tinLine()], { duePayment: '1' })).expect(201)).body
          .grandTotal,
      );
      const shopAfter = await t.prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
      expect(shopAfter).toEqual(shopBefore);
      // the ledger only grew by the two invoices' own Grand Totals, never by a Due Payment
      const ledgerAfter = (await draft(`?shopId=${shop.id}`)).body.duePayment as string;
      const twoInvoices = Number(res.body.grandTotal) * 2;
      expect(Math.round((Number(ledgerAfter) - Number(ledgerBefore)) * 100)).toBe(
        Math.round(twoInvoices * 100),
      );
    });

    it('optional invoice-level values: blank / 0 are not kept; entered ones are kept as-is', async () => {
      const blank = await createInvoice(
        invoice([tinLine()], {
          advanceTax: '',
          furtherTax: '0',
          adtDiscount: null,
          payableValue: '0.00',
        }),
      ).expect(201);
      expect(blank.body).toMatchObject({
        advanceTax: null,
        furtherTax: null,
        adtDiscount: null,
        payableValue: null,
        duePayment: null,
      });
      const filled = await createInvoice(
        invoice([tinLine()], {
          advanceTax: '120.5',
          furtherTax: '300',
          adtDiscount: '50',
          payableValue: '7900',
        }),
      ).expect(201);
      expect(filled.body).toMatchObject({
        advanceTax: '120.50',
        furtherTax: '300.00',
        adtDiscount: '50.00',
        payableValue: '7900.00',
        // no formula: they never change the Grand Total
        grandTotal: blank.body.grandTotal,
      });
    });
  });

  describe('row rules', () => {
    const one = async (line: object) =>
      (await createInvoice(invoice([line])).expect(201)).body.items[0];

    it('POUCH: edited display pieces never change the value; missing pieces are derived', async () => {
      const edited = await one(pouchLine({ qtyPcs: 7 }));
      expect(edited).toMatchObject({ qtyCtn: 2, qtyPcs: 7, valueExclTax: '4204.00' });
      const derived = await one(pouchLine({ qtyPcs: undefined }));
      expect(derived).toMatchObject({ qtyPcs: 10, valueExclTax: '4204.00' });
    });

    it('TIN: Qty Ctn is not stored', async () => {
      expect(await one(tinLine({ qtyCtn: 5 }))).toMatchObject({ qtyCtn: null, qtyPcs: 3 });
    });

    it('uses the trade price typed on the invoice without changing the product', async () => {
      const row = await one(tinLine({ tradePrice: '2000', qtyPcs: 2 }));
      expect(row).toMatchObject({ tradePrice: '2000.00', valueExclTax: '4000.00' });
      const product = await t.prisma.product.findUniqueOrThrow({ where: { id: tin.id } });
      expect(product.tradePrice.toFixed(2)).toBe('2102.50');
    });

    it('retail price is display only', async () => {
      const a = await one(tinLine({ retailPrice: '1' }));
      const b = await one(tinLine({ retailPrice: '99999' }));
      expect(a.retailPrice).toBe('1.00');
      expect(b.retailPrice).toBe('99999.00');
      expect(a.grossValue).toBe(b.grossValue);
    });

    it('cost price never reaches the shop invoice values', async () => {
      const before = await one(tinLine());
      await t.prisma.product.update({ where: { id: tin.id }, data: { invoiceCostPrice: '1' } });
      const after = await one(tinLine());
      await t.prisma.product.update({ where: { id: tin.id }, data: { invoiceCostPrice: '2000' } });
      expect(after.grossValue).toBe(before.grossValue);
      expect(after.costTotal).toBe('3.00');
    });

    it('rounds GST half up to 2 decimals', async () => {
      expect((await one(tinLine({ qtyPcs: 1, tradePrice: '4204.03' }))).gstAmount).toBe('756.73');
      expect((await one(tinLine({ qtyPcs: 1, tradePrice: '4204.02' }))).gstAmount).toBe('756.72');
    });

    it('uses the GST rate typed on the row (never a fixed 18%)', async () => {
      const row = await one(
        pouchLine({ gstRate: '17', toRate: '0', atoRate: '0', specialDiscount: '0' }),
      );
      expect(row).toMatchObject({ gstRate: '17', gstAmount: '714.68', grossValue: '4918.68' });
    });
  });

  describe('validation', () => {
    it.each([
      ['TIN without Qty (Pcs)', () => tinLine({ qtyPcs: null }), 'items.0.qtyPcs'],
      ['POUCH without Qty (Ctn)', () => pouchLine({ qtyCtn: 0 }), 'items.0.qtyCtn'],
      ['an inactive product', () => tinLine({ productId: retired.id }), 'items.0.productId'],
      ["another company's product", () => tinLine({ productId: productB.id }), 'items.0.productId'],
      [
        'TO on a product without weight',
        () => tinLine({ productId: unweighed.id, toRate: '5' }),
        'items.0.toRate',
      ],
      [
        'a trade offer above the value',
        () => tinLine({ qtyPcs: 1, specialDiscount: '999999' }),
        'items.0.specialDiscount',
      ],
    ])('rejects %s (422) and saves nothing', async (_label, line, path) => {
      const before = await t.prisma.invoice.count();
      const res = await createInvoice(invoice([line()])).expect(422);
      expect(details(res).map((d) => d.path)).toEqual([path]);
      expect(await t.prisma.invoice.count()).toBe(before);
    });

    it.each([
      ['no rows', { items: [] }, 'items'],
      [
        'a bad GST rate',
        {
          items: [
            {
              productId: '0199a000-0000-7000-8000-000000000000',
              qtyPcs: 1,
              retailPrice: '1',
              tradePrice: '1',
              gstRate: '101',
            },
          ],
        },
        'items.0.gstRate',
      ],
      [
        'a price sent as a number',
        {
          items: [
            {
              productId: '0199a000-0000-7000-8000-000000000000',
              qtyPcs: 1,
              retailPrice: '1',
              tradePrice: 1,
              gstRate: '18',
            },
          ],
        },
        'items.0.tradePrice',
      ],
      ['an invalid date', { invoiceDate: '2026-02-30' }, 'invoiceDate'],
      ['a negative due payment', { duePayment: '-5' }, 'duePayment'],
    ])('rejects %s (400)', async (_label, patch, path) => {
      const res = await createInvoice(invoice([tinLine()], patch)).expect(400);
      expect(details(res).map((d) => d.path)).toContain(path);
    });

    it("rejects an inactive shop and another company's shop", async () => {
      const closed = await createInvoice(invoice([tinLine()], { shopId: closedShop.id })).expect(
        422,
      );
      expect(details(closed)).toEqual([{ path: 'shopId', message: 'This shop is inactive' }]);
      const foreign = await createInvoice(invoice([tinLine()], { shopId: shopB.id })).expect(422);
      expect(details(foreign)).toEqual([{ path: 'shopId', message: 'Shop not found' }]);
    });
  });

  describe('invoice from a pending order', () => {
    let order: { id: string; orderNumber: string };

    it('prefills the shop, products and booked quantities (TIN pcs, POUCH ctn → pcs)', async () => {
      order = await bookOrder([
        [pouch, 3],
        [tin, 12],
      ]);
      const res = await draft(`?orderId=${order.id}`).expect(200);
      expect(res.body.shop.id).toBe(shop.id);
      expect(res.body.order).toEqual({ id: order.id, orderNumber: order.orderNumber });
      const rows = res.body.items.map(
        (i: { product: { name: string; tradePrice: string }; qtyCtn: number; qtyPcs: number }) => [
          i.product.name,
          i.qtyCtn,
          i.qtyPcs,
          i.product.tradePrice,
        ],
      );
      expect(rows).toEqual([
        ['mbp 4.5Kg TIN', null, 12, '2102.50'],
        ['mbp POUCH 1*5', 3, 15, '2102.00'],
      ]);
    });

    it('confirms with the Admin edits and marks the order INVOICED', async () => {
      const res = await createInvoice(
        invoice([tinLine({ qtyPcs: 10 }), pouchLine({ qtyCtn: 3 })], { orderId: order.id }),
      ).expect(201);
      expect(res.body.order).toEqual({ id: order.id, orderNumber: order.orderNumber });
      const orderNow = await http()
        .get(`/api/orders/${order.id}`)
        .set(auth(adminToken))
        .expect(200);
      expect(orderNow.body).toMatchObject({
        status: 'INVOICED',
        invoice: { id: res.body.id, invoiceNumber: res.body.invoiceNumber },
      });
    });

    it('the same order cannot be invoiced twice (and its draft is refused)', async () => {
      const res = await createInvoice(invoice([tinLine()], { orderId: order.id })).expect(409);
      expect(res.body.message).toBe('Only pending orders can be invoiced (this order is invoiced)');
      await draft(`?orderId=${order.id}`).expect(409);
    });

    it('a cancelled order cannot be invoiced', async () => {
      const cancelled = await bookOrder([[tin, 1]]);
      await http().post(`/api/orders/${cancelled.id}/cancel`).set(auth(adminToken)).expect(200);
      await createInvoice(invoice([tinLine()], { orderId: cancelled.id })).expect(409);
      await draft(`?orderId=${cancelled.id}`).expect(409);
    });

    it('rejects an order of another shop or another company', async () => {
      const elsewhere = await bookOrder([[tin, 1]], otherShop);
      const wrongShop = await createInvoice(invoice([tinLine()], { orderId: elsewhere.id })).expect(
        422,
      );
      expect(details(wrongShop)).toEqual([
        { path: 'orderId', message: 'This order belongs to another shop' },
      ]);
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: elsewhere.id } })).status).toBe(
        'PENDING',
      );
      const bookerB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ORDER_BOOKER' });
      await t.prisma.shop.update({
        where: { id: shopB.id },
        data: { assignedOrderBookerId: bookerB.id },
      });
      const bToken = (await login(t.app, bookerB.email)).accessToken;
      const orderB = await http()
        .post('/api/orders')
        .set(auth(bToken))
        .send({ shopId: shopB.id, items: [{ productId: productB.id, quantity: 1 }] })
        .expect(201);
      const foreign = await createInvoice(invoice([tinLine()], { orderId: orderB.body.id })).expect(
        422,
      );
      expect(details(foreign)).toEqual([{ path: 'orderId', message: 'Order not found' }]);
      await draft(`?orderId=${orderB.body.id}`).expect(404);
    });

    it('two simultaneous invoices for one order: exactly one succeeds', async () => {
      const contested = await bookOrder([[tin, 2]]);
      const results = await Promise.all(
        [1, 2].map(() => createInvoice(invoice([tinLine()], { orderId: contested.id }))),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await t.prisma.invoice.count({ where: { orderId: contested.id } })).toBe(1);
    });

    it('rolls everything back when the invoice fails after the order was claimed', async () => {
      const pending = await bookOrder([[tin, 2]]);
      const numberBefore = await nextNumber();
      const countBefore = await t.prisma.invoice.count();
      // The order flip and the number allocation run first; the inactive product then fails.
      await createInvoice(
        invoice([tinLine(), tinLine({ productId: retired.id })], { orderId: pending.id }),
      ).expect(422);
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(
        'PENDING',
      );
      expect(await nextNumber()).toBe(numberBefore);
      expect(await t.prisma.invoice.count()).toBe(countBefore);
    });
  });

  describe('invoice numbers', () => {
    it('15 simultaneous invoices get 15 different, consecutive numbers', async () => {
      const start = Number((await nextNumber()).slice(2));
      const results = await Promise.all(
        Array.from({ length: 15 }, () => createInvoice(invoice([tinLine()]))),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const numbers = results
        .map((r) => Number(r.body.invoiceNumber.slice(2)))
        .sort((a, b) => a - b);
      expect(numbers).toEqual(Array.from({ length: 15 }, (_, i) => start + i));
    });

    it('numbers are per organization', async () => {
      const f = fixtures(t.prisma);
      const productB2 = await f.product(orgB.id, 'B Tin');
      const res = await createInvoice(
        {
          shopId: shopB.id,
          invoiceDate: '2026-10-05',
          items: [tinLine({ productId: productB2.id })],
        },
        adminBToken,
      ).expect(201);
      expect(res.body.invoiceNumber).toBe('INV-000001');
    });
  });

  describe('preview', () => {
    it('returns the server values and saves nothing', async () => {
      const count = await t.prisma.invoice.count();
      const number = await nextNumber();
      const res = await http()
        .post('/api/invoices/preview')
        .set(auth(adminToken))
        .send(invoice([pouchLine()]))
        .expect(200);
      expect(res.body).toMatchObject({ grandTotal: '4878.72', totalGstAmount: '756.72' });
      expect(await t.prisma.invoice.count()).toBe(count);
      expect(await nextNumber()).toBe(number);
    });
  });

  describe('list, history and cancellation', () => {
    it("lists a shop's invoices, newest first, with search and status filters", async () => {
      const res = await list(`?shopId=${shop.id}&pageSize=100`).expect(200);
      expect(res.body.total).toBeGreaterThan(5);
      expect(res.body.items.every((i: { shop: Id }) => i.shop.id === shop.id)).toBe(true);
      const byNumber = await list('?q=M-00000001').expect(200);
      expect(byNumber.body.items.map((i: { invoiceNumber: string }) => i.invoiceNumber)).toEqual([
        'M-00000001',
      ]);
      expect(byNumber.body.items[0]).toMatchObject({ grandTotal: '12321.57', status: 'CONFIRMED' });
      await list('?status=VOID').expect(400);
    });

    it('Admin cancels with a reason; data is kept; the linked order stays INVOICED', async () => {
      const withOrder = (await list('?pageSize=100')).body.items.find(
        (i: { order: Id | null }) => i.order,
      );
      await cancel(withOrder.id, {}).expect(400);
      const res = await cancel(withOrder.id, { reason: 'Wrong shop' }).expect(200);
      expect(res.body).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Wrong shop',
        cancelledBy: { id: adminA.id },
        grandTotal: withOrder.grandTotal,
      });
      await cancel(withOrder.id, { reason: 'again' }).expect(409);
      const order = await t.prisma.order.findUniqueOrThrow({ where: { id: withOrder.order.id } });
      expect(order.status).toBe('INVOICED');
      const cancelled = await list('?status=CANCELLED').expect(200);
      expect(cancelled.body.items.map((i: Id) => i.id)).toEqual([withOrder.id]);
    });
  });

  describe('append-only in the database', () => {
    it('refuses to change or delete a confirmed invoice or its rows', async () => {
      const id = (await list('?status=CONFIRMED')).body.items[0].id;
      await expect(
        t.prisma.invoice.update({ where: { id }, data: { grandTotal: '1' } }),
      ).rejects.toThrow(/can only be cancelled/);
      await expect(t.prisma.invoice.delete({ where: { id } })).rejects.toThrow(/never deleted/);
      await expect(
        t.prisma.invoiceItem.updateMany({ where: { invoiceId: id }, data: { grossValue: '1' } }),
      ).rejects.toThrow(/append-only/);
      await expect(t.prisma.invoiceItem.deleteMany({ where: { invoiceId: id } })).rejects.toThrow(
        /append-only/,
      );
    });
  });

  describe('permissions', () => {
    it('Order Bookers cannot use any invoice endpoint', async () => {
      const id = (await list()).body.items[0].id;
      await list('', bookerToken).expect(403);
      await getInvoice(id, bookerToken).expect(403);
      await draft(`?shopId=${shop.id}`, bookerToken).expect(403);
      await createInvoice(invoice([tinLine()]), bookerToken).expect(403);
      await cancel(id, { reason: 'nope' }, bookerToken).expect(403);
      await http()
        .post('/api/invoices/preview')
        .set(auth(bookerToken))
        .send(invoice([tinLine()]))
        .expect(403);
    });

    it('Super Admin cannot use organization invoices; anonymous gets 401', async () => {
      await list('', superToken).expect(403);
      await createInvoice(invoice([tinLine()]), superToken).expect(403);
      await http().get('/api/invoices').expect(401);
      await http()
        .post('/api/invoices')
        .send(invoice([tinLine()]))
        .expect(401);
    });
  });

  describe('tenant isolation', () => {
    it("Company B sees none of Company A's invoices and cannot open or cancel them (404)", async () => {
      const idA = (await list()).body.items[0].id;
      const listB = await list('?pageSize=100', adminBToken).expect(200);
      expect(listB.body.items.map((i: { shop: Id }) => i.shop.id)).toEqual([shopB.id]);
      await getInvoice(idA, adminBToken).expect(404);
      await cancel(idA, { reason: 'hostile' }, adminBToken).expect(404);
      await draft(`?shopId=${shop.id}`, adminBToken).expect(404);
      expect((await t.prisma.invoice.findUniqueOrThrow({ where: { id: idA } })).status).toBe(
        'CONFIRMED',
      );
    });

    it("Company B cannot invoice Company A's shop or products", async () => {
      await createInvoice(invoice([tinLine({ productId: productB.id })]), adminBToken).expect(422);
      const res = await createInvoice(
        { shopId: shopB.id, invoiceDate: '2026-10-05', items: [tinLine()] },
        adminBToken,
      ).expect(422);
      expect(details(res)).toEqual([{ path: 'items.0.productId', message: 'Product not found' }]);
    });
  });
});
