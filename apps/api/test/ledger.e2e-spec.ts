import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };
type Res = request.Response;

describe('Shop ledger & payments (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let orgB: Id;
  let adminToken: string;
  let adminBToken: string;
  let bookerToken: string;
  let superToken: string;
  let saddar: Id;
  let cantt: Id;
  let areaB: Id;
  let bilal: Id;
  let ibrahim: Id;
  let ideal: Id;
  let jawad: Id;
  let empty: Id;
  let closedNoEntries: Id;
  let canttShop: Id;
  let scratch: Id;
  let shopB: Id;
  let product: Id;
  let productB: Id;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const ledger = (shop: Id, token = adminToken, query = '') =>
    http().get(`/api/shops/${shop.id}/ledger${query}`).set(auth(token));
  const pay = (shop: Id, body: object, token = adminToken) =>
    http()
      .post(`/api/shops/${shop.id}/payments`)
      .set(auth(token))
      .send({ paymentDate: '2025-09-05', ...body });
  const adjust = (shop: Id, body: object, token = adminToken) =>
    http()
      .post(`/api/shops/${shop.id}/adjustments`)
      .set(auth(token))
      .send({ adjustmentDate: '2025-09-01', reason: 'Old khata balance', ...body });
  const areaLedger = (area: Id, query: string, token = adminToken) =>
    http().get(`/api/ledger/areas/${area.id}?${query}`).set(auth(token));
  const balanceOf = async (shop: Id) =>
    (await ledger(shop).expect(200)).body.balance.outstandingBalance as string;
  /** An invoice whose Grand Total is exactly `amount` (1 piece, GST 0, no trade offer). */
  const invoice = (
    shop: Id,
    invoiceDate: string,
    amount: string,
    token = adminToken,
    p = product,
  ) =>
    http()
      .post('/api/invoices')
      .set(auth(token))
      .send({
        shopId: shop.id,
        invoiceDate,
        items: [
          {
            productId: p.id,
            qtyPcs: 1,
            retailPrice: amount,
            tradePrice: amount,
            gstRate: '0',
          },
        ],
      });
  const rowOf = (res: Res, shop: Id) =>
    res.body.rows.find((r: { shop: Id }) => r.shop.id === shop.id);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    const booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const superUser = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });

    saddar = await f.area(orgA.id, 'Saddar');
    cantt = await f.area(orgA.id, 'Cantt');
    areaB = await f.area(orgB.id, 'B Area');
    bilal = await f.shop(orgA.id, 'Bilal Store', saddar.id, booker.id);
    ibrahim = await f.shop(orgA.id, 'Ibrahim Store', saddar.id, booker.id);
    ideal = await f.shop(orgA.id, 'Ideal Store', saddar.id, null);
    jawad = await f.shop(orgA.id, 'Jawad Store', saddar.id, null);
    empty = await f.shop(orgA.id, 'Zero Store', saddar.id, null);
    closedNoEntries = await f.shop(orgA.id, 'Closed Store', saddar.id, null, false);
    canttShop = await f.shop(orgA.id, 'Cantt Store', cantt.id, null);
    scratch = await f.shop(orgA.id, 'Scratch Store', cantt.id, null);
    shopB = await f.shop(orgB.id, 'B Store', areaB.id, null);
    product = await f.product(orgA.id, 'Plain Tin');
    productB = await f.product(orgB.id, 'B Tin');

    adminToken = (await login(t.app, admin.email)).accessToken;
    bookerToken = (await login(t.app, booker.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;
    superToken = (await login(t.app, superUser.email)).accessToken;
  });

  afterAll(() => t.close());

  describe('balance is derived from ledger entries', () => {
    it('a new shop owes nothing and has no history', async () => {
      const res = await ledger(scratch).expect(200);
      expect(res.body).toMatchObject({
        items: [],
        total: 0,
        balance: { outstandingBalance: '0.00', totalDebit: '0.00', totalCredit: '0.00' },
      });
    });

    it('a confirmed invoice creates exactly one INVOICE debit of its Grand Total', async () => {
      const inv = await invoice(scratch, '2025-08-01', '1500.50').expect(201);
      const entries = await t.prisma.shopLedgerEntry.findMany({
        where: { invoiceId: inv.body.id },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ type: 'INVOICE', shopId: scratch.id });
      expect(entries[0].debitAmount.toFixed(2)).toBe(inv.body.grandTotal);
      expect(entries[0].creditAmount.toFixed(2)).toBe('0.00');
      expect(entries[0].transactionDate.toISOString().slice(0, 10)).toBe('2025-08-01');
      const history = await ledger(scratch).expect(200);
      expect(history.body.items[0]).toMatchObject({
        type: 'INVOICE',
        debit: '1500.50',
        credit: '0.00',
        runningBalance: '1500.50',
        invoice: { id: inv.body.id, invoiceNumber: inv.body.invoiceNumber },
      });
    });

    it('the database refuses a second debit for the same invoice', async () => {
      const entry = await t.prisma.shopLedgerEntry.findFirstOrThrow({
        where: { shopId: scratch.id },
      });
      await expect(
        t.prisma.shopLedgerEntry.create({
          data: {
            organizationId: orgA.id,
            shopId: scratch.id,
            type: 'INVOICE',
            debitAmount: '1',
            transactionDate: new Date(),
            invoiceId: entry.invoiceId,
            createdById: entry.createdById,
          },
        }),
      ).rejects.toThrow();
    });

    it('more invoices add up; shop details and the shop list show the same balance', async () => {
      await invoice(scratch, '2025-08-02', '499.50').expect(201);
      expect(await balanceOf(scratch)).toBe('2000.00');
      const details = await http()
        .get(`/api/shops/${scratch.id}`)
        .set(auth(adminToken))
        .expect(200);
      expect(details.body.outstandingBalance).toBe('2000.00');
      const list = await http()
        .get(`/api/shops?areaId=${cantt.id}`)
        .set(auth(adminToken))
        .expect(200);
      const balances = Object.fromEntries(
        list.body.items.map((s: { name: string; outstandingBalance: string }) => [
          s.name,
          s.outstandingBalance,
        ]),
      );
      expect(balances).toEqual({ 'Cantt Store': '0.00', 'Scratch Store': '2000.00' });
    });
  });

  describe('payments', () => {
    it('a payment is a PAYMENT credit that reduces the balance and leaves invoices untouched', async () => {
      const invoiceBefore = (
        await http().get('/api/invoices?pageSize=100').set(auth(adminToken))
      ).body.items.filter((i: { shop: Id }) => i.shop.id === scratch.id);
      const res = await pay(scratch, {
        amount: '750.25',
        method: 'CHEQUE',
        reference: 'CHQ-991',
        notes: 'Cheque received',
        organizationId: orgB.id,
      }).expect(201);
      expect(res.body.entry).toMatchObject({
        type: 'PAYMENT',
        debit: '0.00',
        credit: '750.25',
        transactionDate: '2025-09-05',
        runningBalance: '1249.75',
        payment: { method: 'CHEQUE', reference: 'CHQ-991' },
        notes: 'Cheque received',
      });
      expect(res.body.balance.outstandingBalance).toBe('1249.75');
      const payment = await t.prisma.payment.findUniqueOrThrow({
        where: { id: res.body.entry.payment.id },
      });
      expect(payment.organizationId).toBe(orgA.id);
      expect(payment.amount.toFixed(2)).toBe('750.25');
      const invoiceAfter = (
        await http().get('/api/invoices?pageSize=100').set(auth(adminToken))
      ).body.items.filter((i: { shop: Id }) => i.shop.id === scratch.id);
      expect(invoiceAfter).toEqual(invoiceBefore);
    });

    it('a payment above the outstanding balance is rejected; paying exactly the balance works', async () => {
      const before = await t.prisma.payment.count();
      const res = await pay(scratch, { amount: '1249.76' }).expect(422);
      expect(res.body.details).toEqual([
        {
          path: 'amount',
          message: 'Payment cannot be more than the outstanding balance (1249.75)',
        },
      ]);
      expect(await t.prisma.payment.count()).toBe(before);
      await pay(scratch, { amount: '1249.75' }).expect(201);
      expect(await balanceOf(scratch)).toBe('0.00');
      await pay(scratch, { amount: '0.01' }).expect(422);
    });

    it.each([
      ['a zero amount', { amount: '0' }, 'amount'],
      ['a negative amount', { amount: '-5' }, 'amount'],
      ['three decimals', { amount: '1.005' }, 'amount'],
      ['a number instead of a string', { amount: 5 }, 'amount'],
      ['an unknown method', { amount: '1', method: 'CRYPTO' }, 'method'],
      ['an invalid date', { amount: '1', paymentDate: '2025-02-30' }, 'paymentDate'],
    ])('rejects %s (400)', async (_label, body, path) => {
      const res = await pay(bilal, body).expect(400);
      expect(res.body.details.map((d: { path: string }) => d.path)).toEqual([path]);
    });

    it('rejects a payment dated in the future (422)', async () => {
      await adjust(scratch, { direction: 'INCREASE', amount: '10' }).expect(201);
      const res = await pay(scratch, { amount: '1', paymentDate: '2999-01-01' }).expect(422);
      expect(res.body.details[0]).toEqual({
        path: 'paymentDate',
        message: 'The date cannot be in the future',
      });
    });

    it('two simultaneous payments cannot overdraw the shop (row lock)', async () => {
      await adjust(scratch, { direction: 'INCREASE', amount: '990' }).expect(201);
      expect(await balanceOf(scratch)).toBe('1000.00');
      const results = await Promise.all([
        pay(scratch, { amount: '600' }),
        pay(scratch, { amount: '600' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await balanceOf(scratch)).toBe('400.00');
    });

    it('keeps exact decimals (0.10 + 0.20 = 0.30)', async () => {
      await pay(scratch, { amount: '0.10' }).expect(201);
      await pay(scratch, { amount: '0.20' }).expect(201);
      expect(await balanceOf(scratch)).toBe('399.70');
    });
  });

  describe('manual adjustments', () => {
    it('increase is a debit, decrease a credit; both need a reason; balance never overwritten', async () => {
      const up = await adjust(canttShop, { direction: 'INCREASE', amount: '5000' }).expect(201);
      expect(up.body.entry).toMatchObject({
        type: 'MANUAL_ADJUSTMENT',
        debit: '5000.00',
        credit: '0.00',
        notes: 'Old khata balance',
      });
      const down = await adjust(canttShop, {
        direction: 'DECREASE',
        amount: '1200.40',
        reason: 'Wrong entry on paper',
        adjustmentDate: '2025-09-02',
      }).expect(201);
      expect(down.body.entry).toMatchObject({ debit: '0.00', credit: '1200.40' });
      expect(down.body.balance.outstandingBalance).toBe('3799.60');
    });

    it('a decrease cannot take the balance below zero; reason and direction are required', async () => {
      await adjust(canttShop, { direction: 'DECREASE', amount: '3799.61' }).expect(422);
      const missing = await adjust(canttShop, { direction: 'SET', amount: '1', reason: '' }).expect(
        400,
      );
      expect(missing.body.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'direction',
        'reason',
      ]);
    });

    it('running balance follows business date, then entry time (backdated entries slot in)', async () => {
      const shop = await fixtures(t.prisma).shop(orgA.id, 'Running Store', cantt.id, null);
      await invoice(shop, '2025-09-10', '1000').expect(201);
      await adjust(shop, {
        direction: 'INCREASE',
        amount: '500',
        adjustmentDate: '2025-09-05',
      }).expect(201);
      await pay(shop, { amount: '200', paymentDate: '2025-09-07' }).expect(201);
      const res = await ledger(shop).expect(200);
      expect(
        res.body.items.map((e: { transactionDate: string; runningBalance: string }) => [
          e.transactionDate,
          e.runningBalance,
        ]),
      ).toEqual([
        ['2025-09-10', '1300.00'],
        ['2025-09-07', '300.00'],
        ['2025-09-05', '500.00'],
      ]);
      expect(res.body.balance.outstandingBalance).toBe('1300.00');
      const page2 = await ledger(shop, adminToken, '?pageSize=1&page=2').expect(200);
      expect(page2.body.items.map((e: { runningBalance: string }) => e.runningBalance)).toEqual([
        '300.00',
      ]);
    });
  });

  describe('invoices and the ledger', () => {
    it('Due Payment prefills from the ledger; editing it never changes the ledger', async () => {
      const balance = await balanceOf(canttShop);
      const draft = await http()
        .get(`/api/invoices/draft?shopId=${canttShop.id}`)
        .set(auth(adminToken))
        .expect(200);
      expect(draft.body.duePayment).toBe(balance);
      const inv = await http()
        .post('/api/invoices')
        .set(auth(adminToken))
        .send({
          shopId: canttShop.id,
          invoiceDate: '2025-09-03',
          duePayment: '1',
          items: [
            {
              productId: product.id,
              qtyPcs: 1,
              retailPrice: '100',
              tradePrice: '100',
              gstRate: '0',
            },
          ],
        })
        .expect(201);
      expect(inv.body.duePayment).toBe('1.00');
      expect(await balanceOf(canttShop)).toBe('3899.60'); // 3799.60 + this invoice's 100.00 only
    });

    it('cancelling keeps the debit and adds one INVOICE_REVERSAL credit of the same amount', async () => {
      const inv = await invoice(canttShop, '2025-09-04', '250.75').expect(201);
      expect(await balanceOf(canttShop)).toBe('4150.35');
      await http()
        .post(`/api/invoices/${inv.body.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Returned' })
        .expect(200);
      await http()
        .post(`/api/invoices/${inv.body.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Again' })
        .expect(409);
      const entries = await t.prisma.shopLedgerEntry.findMany({
        where: { invoiceId: inv.body.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(
        entries.map((e) => [e.type, e.debitAmount.toFixed(2), e.creditAmount.toFixed(2)]),
      ).toEqual([
        ['INVOICE', '250.75', '0.00'],
        ['INVOICE_REVERSAL', '0.00', '250.75'],
      ]);
      expect(entries[1].notes).toBe(`Invoice ${inv.body.invoiceNumber} cancelled: Returned`);
      expect(await balanceOf(canttShop)).toBe('3899.60');
    });

    it('a failed invoice confirmation leaves no ledger entry behind', async () => {
      const before = await t.prisma.shopLedgerEntry.count();
      const retired = await fixtures(t.prisma).product(orgA.id, 'Retired', false);
      await invoice(canttShop, '2025-09-04', '10', adminToken, retired).expect(422);
      expect(await t.prisma.shopLedgerEntry.count()).toBe(before);
    });

    it('ledger entries and payments are append-only in the database', async () => {
      const entry = await t.prisma.shopLedgerEntry.findFirstOrThrow({ where: { type: 'PAYMENT' } });
      await expect(
        t.prisma.shopLedgerEntry.update({ where: { id: entry.id }, data: { creditAmount: '1' } }),
      ).rejects.toThrow(/append-only/);
      await expect(t.prisma.shopLedgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(
        /append-only/,
      );
      await expect(
        t.prisma.payment.update({ where: { id: entry.paymentId! }, data: { amount: '1' } }),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('area ledger (collection sheet)', () => {
    beforeAll(async () => {
      await invoice(bilal, '2025-09-01', '10770').expect(201);
      await invoice(ibrahim, '2025-09-02', '13355').expect(201);
      await invoice(ideal, '2025-09-03', '43322').expect(201);
      await adjust(jawad, { direction: 'INCREASE', amount: '2000' }).expect(201);
      // the selected date, 2025-09-05
      await pay(bilal, { amount: '2000' }).expect(201);
      await pay(ideal, { amount: '20000' }).expect(201);
      await invoice(ideal, '2025-09-05', '1000').expect(201);
      await adjust(ideal, {
        direction: 'DECREASE',
        amount: '500',
        adjustmentDate: '2025-09-05',
      }).expect(201);
      await pay(jawad, { amount: '2000' }).expect(201);
      // after the selected date
      await pay(bilal, { amount: '1000', paymentDate: '2025-09-06' }).expect(201);
    });

    it("lists the area's shops with opening, payments and closing from ledger entries", async () => {
      const res = await areaLedger(saddar, 'date=2025-09-05').expect(200);
      expect(res.body.area).toEqual({ id: saddar.id, name: 'Saddar' });
      expect(
        res.body.rows.map(
          (r: {
            shop: { name: string };
            openingBalance: string;
            dayDebit: string;
            dayOtherCredit: string;
            payments: string;
            closingBalance: string;
          }) => [
            r.shop.name,
            r.openingBalance,
            r.dayDebit,
            r.dayOtherCredit,
            r.payments,
            r.closingBalance,
          ],
        ),
      ).toEqual([
        ['Bilal Store', '10770.00', '0.00', '0.00', '2000.00', '8770.00'],
        ['Ibrahim Store', '13355.00', '0.00', '0.00', '0.00', '13355.00'],
        // same-day invoice (+1,000) and decrease (−500) are part of the closing balance
        ['Ideal Store', '43322.00', '1000.00', '500.00', '20000.00', '23822.00'],
        ['Jawad Store', '2000.00', '0.00', '0.00', '2000.00', '0.00'],
        ['Zero Store', '0.00', '0.00', '0.00', '0.00', '0.00'],
      ]);
      // other areas' shops and inactive shops without entries are not listed
      expect(rowOf(res, canttShop)).toBeUndefined();
      expect(rowOf(res, closedNoEntries)).toBeUndefined();
      // an active shop with no entries is still on the sheet, at zero
      expect(rowOf(res, empty)).toMatchObject({ openingBalance: '0.00', closingBalance: '0.00' });
      expect(rowOf(res, bilal)).toMatchObject({
        currentBalance: '7770.00',
        lastPaymentDate: '2025-09-05',
      });
      expect(res.body.totals).toEqual({
        openingBalance: '69447.00',
        dayDebit: '1000.00',
        dayOtherCredit: '500.00',
        payments: '24000.00',
        closingBalance: '45947.00',
      });
    });

    it('other dates move the window (previous / next day)', async () => {
      const before = await areaLedger(saddar, 'date=2025-09-04').expect(200);
      expect(rowOf(before, ideal)).toMatchObject({
        openingBalance: '43322.00',
        payments: '0.00',
        closingBalance: '43322.00',
      });
      const after = await areaLedger(saddar, 'date=2025-09-06').expect(200);
      expect(rowOf(after, bilal)).toMatchObject({
        openingBalance: '8770.00',
        payments: '1000.00',
        closingBalance: '7770.00',
        lastPaymentDate: '2025-09-06',
      });
    });

    it('filters by shop name and by "outstanding only"', async () => {
      const search = await areaLedger(saddar, 'date=2025-09-05&q=ide').expect(200);
      expect(search.body.rows.map((r: { shop: { name: string } }) => r.shop.name)).toEqual([
        'Ideal Store',
      ]);
      expect(search.body.totals.closingBalance).toBe('23822.00');
      const outstanding = await areaLedger(saddar, 'date=2025-09-05&outstandingOnly=true').expect(
        200,
      );
      expect(outstanding.body.rows.map((r: { shop: { name: string } }) => r.shop.name)).toEqual([
        'Bilal Store',
        'Ibrahim Store',
        'Ideal Store',
        'Jawad Store', // paid off that day — still on the sheet
      ]);
    });

    it('a payment entered from the sheet is a normal shop payment, visible everywhere', async () => {
      const res = await pay(ibrahim, { amount: '355', paymentDate: '2025-09-05' }).expect(201);
      const sheet = await areaLedger(saddar, 'date=2025-09-05').expect(200);
      expect(rowOf(sheet, ibrahim)).toMatchObject({
        payments: '355.00',
        closingBalance: '13000.00',
      });
      expect(sheet.body.totals.payments).toBe('24355.00');
      const history = await ledger(ibrahim).expect(200);
      expect(history.body.items[0]).toMatchObject({ id: res.body.entry.id, type: 'PAYMENT' });
      expect(history.body.balance.outstandingBalance).toBe('13000.00');
      const details = await http()
        .get(`/api/shops/${ibrahim.id}`)
        .set(auth(adminToken))
        .expect(200);
      expect(details.body.outstandingBalance).toBe('13000.00');
    });

    it('rejects a bad date and an unknown area', async () => {
      await areaLedger(saddar, 'date=05-09-2025').expect(400);
      await areaLedger(saddar, '').expect(400);
      await areaLedger({ id: '0199a000-0000-7000-8000-000000000000' }, 'date=2025-09-05').expect(
        404,
      );
    });

    it('Total Market Credit = Σ outstanding of every shop', async () => {
      const shops = await http().get('/api/shops?pageSize=100').set(auth(adminToken)).expect(200);
      const cents = shops.body.items.reduce(
        (acc: bigint, s: { outstandingBalance: string }) =>
          acc + BigInt(s.outstandingBalance.replace('.', '')),
        0n,
      );
      const res = await http().get('/api/ledger/market-credit').set(auth(adminToken)).expect(200);
      expect(BigInt(res.body.marketCredit.replace('.', ''))).toBe(cents);
      expect(res.body.shopsWithBalance).toBe(
        shops.body.items.filter(
          (s: { outstandingBalance: string }) => s.outstandingBalance !== '0.00',
        ).length,
      );
    });
  });

  describe('permissions', () => {
    it('Order Bookers cannot see or change any ledger data', async () => {
      await ledger(bilal, bookerToken).expect(403);
      await pay(bilal, { amount: '1' }, bookerToken).expect(403);
      await adjust(bilal, { direction: 'INCREASE', amount: '1' }, bookerToken).expect(403);
      await areaLedger(saddar, 'date=2025-09-05', bookerToken).expect(403);
      await http().get('/api/ledger/market-credit').set(auth(bookerToken)).expect(403);
      const myShops = await http().get('/api/booker/shops').set(auth(bookerToken)).expect(200);
      expect(JSON.stringify(myShops.body)).not.toMatch(/balance|credit|payment/i);
    });

    it('Super Admin is refused and anonymous calls get 401', async () => {
      await ledger(bilal, superToken).expect(403);
      await pay(bilal, { amount: '1' }, superToken).expect(403);
      await http().get(`/api/shops/${bilal.id}/ledger`).expect(401);
      await http().post(`/api/shops/${bilal.id}/payments`).send({ amount: '1' }).expect(401);
    });
  });

  describe('tenant isolation', () => {
    it("Company B cannot read, pay into or adjust Company A's shop (404) — nothing is written", async () => {
      const before = await t.prisma.shopLedgerEntry.count({ where: { shopId: bilal.id } });
      await ledger(bilal, adminBToken).expect(404);
      await pay(bilal, { amount: '1' }, adminBToken).expect(404);
      await adjust(bilal, { direction: 'INCREASE', amount: '1' }, adminBToken).expect(404);
      await areaLedger(saddar, 'date=2025-09-05', adminBToken).expect(404);
      expect(await t.prisma.shopLedgerEntry.count({ where: { shopId: bilal.id } })).toBe(before);
    });

    it("each company's market credit and sheets only contain its own shops", async () => {
      await invoice(shopB, '2025-09-01', '999', adminBToken, productB).expect(201);
      const b = await http().get('/api/ledger/market-credit').set(auth(adminBToken)).expect(200);
      expect(b.body).toEqual({ marketCredit: '999.00', shopsWithBalance: 1 });
      const sheetB = await areaLedger(areaB, 'date=2025-09-01', adminBToken).expect(200);
      expect(sheetB.body.rows.map((r: { shop: Id }) => r.shop.id)).toEqual([shopB.id]);
      await ledger(shopB).expect(404);
      await pay(shopB, { amount: '1' }).expect(404);
      expect(await t.prisma.shopLedgerEntry.count({ where: { shopId: shopB.id } })).toBe(1);
    });
  });
});
