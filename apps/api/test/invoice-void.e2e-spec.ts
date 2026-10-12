import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };
interface Entry {
  type: string;
  debit: string;
  credit: string;
  transactionDate: string;
  invoice: { id: string; invoiceNumber: string } | null;
  notes: string | null;
}

/**
 * D-42 — "Delete invoice" is a soft delete (void): the invoice stays, status VOIDED with who /
 * when / why, the ledger gets an INVOICE_VOID_REVERSAL credit of its current value, and the
 * invoice leaves every business figure. Products: TIN, T.P 100, GST 0, cost 80, 4.5 kg / piece.
 */
describe('Invoice delete / void (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let adminToken: string;
  let bookerToken: string;
  let adminBToken: string;
  let superToken: string;
  let shop: Id;
  let other: Id;
  let tin: Id;
  let today: string;
  let a: { id: string; invoiceNumber: string; createdAt: string };
  let b: { id: string; invoiceNumber: string };

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const line = (qtyPcs: number) => ({
    productId: tin.id,
    qtyPcs,
    retailPrice: '120',
    tradePrice: '100',
    gstRate: '0',
    toRate: '0',
  });
  const create = async (qty: number, forShop: Id = shop) =>
    (
      await http()
        .post('/api/invoices')
        .set(auth(adminToken))
        .send({ shopId: forShop.id, invoiceDate: today, items: [line(qty)] })
        .expect(201)
    ).body as { id: string; invoiceNumber: string; createdAt: string };
  const voidInvoice = (id: string, body: object, token = adminToken) =>
    http().post(`/api/invoices/${id}/void`).set(auth(token)).send(body);
  const getInvoice = (id: string, token = adminToken) =>
    http().get(`/api/invoices/${id}`).set(auth(token));
  const get = async (path: string) =>
    (await http().get(`/api${path}`).set(auth(adminToken)).expect(200)).body;
  const ledger = async (shopId = shop.id) =>
    (await get(`/shops/${shopId}/ledger?pageSize=100`)) as {
      items: Entry[];
      balance: { outstandingBalance: string };
    };
  const period = () => `?from=${today}&to=${today}`;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Ali Akbar Traders' });
    const orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    const booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const superUser = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });
    const area = await f.area(orgA.id, 'Saddar');
    shop = await f.shop(orgA.id, 'Bilal Store', area.id, booker.id);
    other = await f.shop(orgA.id, 'Other Store', area.id, booker.id);
    tin = await f.product(orgA.id, 'Tin One');
    adminToken = (await login(t.app, admin.email)).accessToken;
    bookerToken = (await login(t.app, booker.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;
    superToken = (await login(t.app, superUser.email)).accessToken;
    today = (await get(`/invoices/draft?shopId=${shop.id}`)).invoiceDate;

    a = await create(10); // 1,000
    b = await create(5); // 500
    // A is edited before it is deleted: its current value becomes 1,200
    await http()
      .put(`/api/invoices/${a.id}`)
      .set(auth(adminToken))
      .send({ invoiceDate: today, items: [line(12)], reason: 'Two more pieces delivered' })
      .expect(200);
  });

  afterAll(() => t.close());

  describe('deleting (voiding) a confirmed invoice', () => {
    it('requires a reason (400) and changes nothing without one', async () => {
      await voidInvoice(a.id, {}).expect(400);
      await voidInvoice(a.id, { reason: '  ' }).expect(400);
      expect((await getInvoice(a.id).expect(200)).body.status).toBe('CONFIRMED');
    });

    it('voids it: status VOIDED with who / when / why; number, dates, lines and edits kept', async () => {
      const res = await voidInvoice(a.id, { reason: 'Invoice created for wrong shop' }).expect(200);
      expect(res.body).toMatchObject({
        id: a.id,
        invoiceNumber: a.invoiceNumber,
        createdAt: a.createdAt,
        status: 'VOIDED',
        voidReason: 'Invoice created for wrong shop',
        voidedBy: { id: expect.any(String) },
        payableValue: '1200.00',
        editCount: 1,
        cancelledAt: null,
        items: [expect.objectContaining({ productName: 'Tin One', qtyPcs: 12 })],
        shopSnapshot: expect.objectContaining({ name: 'Bilal Store' }),
      });
      expect(res.body.voidedAt).toEqual(expect.any(String));
      expect(res.body.revisions).toHaveLength(1);
    });

    it('the invoice and its lines are still in the database (no hard delete)', async () => {
      const row = await t.prisma.invoice.findUniqueOrThrow({
        where: { id: a.id },
        include: { items: true, revisions: true },
      });
      expect(row.status).toBe('VOIDED');
      expect(row.items).toHaveLength(1);
      expect(row.revisions).toHaveLength(1);
    });

    it('ledger: original debit and edit entries stay, one exact reversal of the current value', async () => {
      const { items, balance } = await ledger();
      const forA = items.filter((e) => e.invoice?.id === a.id);
      expect(forA.map((e) => [e.type, e.debit, e.credit]).sort()).toEqual(
        [
          ['INVOICE', '1000.00', '0.00'],
          ['INVOICE_EDIT', '1200.00', '0.00'],
          ['INVOICE_EDIT_REVERSAL', '0.00', '1000.00'],
          ['INVOICE_VOID_REVERSAL', '0.00', '1200.00'],
        ].sort(),
      );
      const reversal = items[0];
      expect(reversal).toMatchObject({
        type: 'INVOICE_VOID_REVERSAL',
        credit: '1200.00',
        transactionDate: today,
        invoice: { id: a.id, invoiceNumber: a.invoiceNumber },
      });
      expect(reversal.notes).toBe(
        `Invoice ${a.invoiceNumber} deleted: Invoice created for wrong shop`,
      );
      // net effect of A is zero; only B remains owed
      expect(balance.outstandingBalance).toBe('500.00');
    });

    it('Market Credit and the shop credit / collection report follow the reversal', async () => {
      expect((await get('/ledger/market-credit')).marketCredit).toBe('500.00');
      const credit = await get('/reports/shop-credit');
      expect(credit.marketCredit).toBe('500.00');
      expect(credit.rows.find((r: { shop: Id }) => r.shop.id === shop.id).outstanding).toBe(
        '500.00',
      );
    });

    it('dashboard excludes it: sales, invoice count, weight, top shops; market credit updated', async () => {
      const dash = await get('/dashboard/summary');
      expect(dash).toMatchObject({
        monthlySales: '500.00',
        monthlyInvoiceCount: 1,
        monthlyWeightKg: '22.500',
        marketCredit: '500.00',
        monthlyGrossProfit: '100.00',
      });
      expect(dash.topShops).toEqual([
        expect.objectContaining({ shop: { id: shop.id, name: 'Bilal Store' }, sales: '500.00' }),
      ]);
    });

    it('sales, profit and product sales exclude it', async () => {
      expect((await get(`/reports/sales${period()}`)).totals).toMatchObject({
        invoiceCount: 1,
        payableValue: '500.00',
      });
      expect((await get(`/profit/summary${period()}`)).grossProfit).toBe('100.00');
      const products = await get(`/reports/product-sales${period()}`);
      expect(products.rows).toEqual([
        expect.objectContaining({ quantity: 5, salesValue: '500.00', profit: '100.00' }),
      ]);
    });

    it('invoices report lists it for audit but never counts it', async () => {
      const all = await get(`/reports/invoices${period()}`);
      expect(all.totals).toMatchObject({ invoiceCount: 1, payableValue: '500.00' });
      expect(all.voidedCount).toBe(1);
      expect(all.rows.map((r: { status: string }) => r.status).sort()).toEqual([
        'CONFIRMED',
        'VOIDED',
      ]);
      const voided = await get(`/reports/invoices${period()}&status=VOIDED`);
      expect(voided.rows.map((r: { id: string }) => r.id)).toEqual([a.id]);
      expect(voided.totals.invoiceCount).toBe(0);
    });

    it('the invoice list filters by VOIDED; it stays viewable and printable', async () => {
      const list = await get('/invoices?status=VOIDED');
      expect(list.items.map((i: { id: string }) => i.id)).toEqual([a.id]);
      expect((await get('/invoices?status=CONFIRMED')).items.map((i: Id) => i.id)).toEqual([b.id]);
      const batch = await get(`/invoices/batch?ids=${a.id}`);
      expect(batch[0]).toMatchObject({ status: 'VOIDED', invoiceNumber: a.invoiceNumber });
    });

    it('a voided invoice cannot be edited, deleted again or cancelled', async () => {
      const edit = await http()
        .put(`/api/invoices/${a.id}`)
        .set(auth(adminToken))
        .send({ invoiceDate: today, items: [line(1)], reason: 'Try again' })
        .expect(409);
      expect(edit.body.message).toMatch(/deleted invoice cannot be edited/);
      await http().get(`/api/invoices/${a.id}/edit-draft`).set(auth(adminToken)).expect(409);
      const again = await voidInvoice(a.id, { reason: 'Second time' }).expect(409);
      expect(again.body.message).toMatch(/already been deleted/);
      await http()
        .post(`/api/invoices/${a.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Cancel it too' })
        .expect(409);
      const reversals = (await ledger()).items.filter(
        (e) => e.invoice?.id === a.id && e.type === 'INVOICE_VOID_REVERSAL',
      );
      expect(reversals).toHaveLength(1);
    });

    it('a cancelled invoice cannot be deleted (it is already reversed)', async () => {
      const c = await create(1, other);
      await http()
        .post(`/api/invoices/${c.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Not needed' })
        .expect(200);
      const res = await voidInvoice(c.id, { reason: 'Delete it' }).expect(409);
      expect(res.body.message).toMatch(/already cancelled/);
    });

    it('is refused when the reversal would make the shop balance negative (payment safety)', async () => {
      const c = await create(10, other); // 1,000
      const owed = (await ledger(other.id)).balance.outstandingBalance;
      await http()
        .post(`/api/shops/${other.id}/payments`)
        .set(auth(adminToken))
        .send({ amount: owed, paymentDate: today, method: 'CASH' })
        .expect(201);
      const res = await voidInvoice(c.id, { reason: 'Wrong shop' }).expect(409);
      expect(res.body.message).toMatch(
        /Cannot delete invoice .*balance would become -1000\.00.*resolve the payment \/ credit first/,
      );
      const after = await getInvoice(c.id).expect(200);
      expect(after.body).toMatchObject({ status: 'CONFIRMED', voidedAt: null });
      expect((await ledger(other.id)).balance.outstandingBalance).toBe('0.00');
    });

    it('the database refuses a hard delete or a void without its audit fields', async () => {
      await expect(t.prisma.invoice.delete({ where: { id: b.id } })).rejects.toThrow(
        /never deleted/,
      );
      await expect(
        t.prisma.invoice.update({ where: { id: b.id }, data: { status: 'VOIDED' } }),
      ).rejects.toThrow();
      await expect(
        t.prisma.invoice.update({ where: { id: a.id }, data: { status: 'CONFIRMED' } }),
      ).rejects.toThrow();
    });
  });

  describe('permissions and tenant isolation', () => {
    it('only an Admin of the organization can delete; others change nothing', async () => {
      await voidInvoice(b.id, { reason: 'Booker try' }, bookerToken).expect(403);
      await voidInvoice(b.id, { reason: 'Super try' }, superToken).expect(403);
      await http().post(`/api/invoices/${b.id}/void`).send({ reason: 'No token' }).expect(401);
      await voidInvoice(b.id, { reason: 'Other org' }, adminBToken).expect(404);
      await getInvoice(b.id, adminBToken).expect(404);
      expect((await getInvoice(b.id).expect(200)).body.status).toBe('CONFIRMED');
      expect((await ledger()).balance.outstandingBalance).toBe('500.00');
    });

    it('voided invoices of one organization never show in another', async () => {
      const res = await http()
        .get('/api/invoices?status=VOIDED')
        .set(auth(adminBToken))
        .expect(200);
      expect(res.body.total).toBe(0);
      expect(await t.prisma.invoice.count({ where: { organizationId: orgA.id } })).toBe(4);
    });
  });
});
