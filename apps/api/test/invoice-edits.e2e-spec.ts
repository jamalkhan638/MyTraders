import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };
type Res = request.Response;
interface Entry {
  type: string;
  debit: string;
  credit: string;
  runningBalance: string;
  transactionDate: string;
  invoice: { id: string; invoiceNumber: string } | null;
  notes: string | null;
}

/**
 * D-41 — editing a confirmed invoice, the invoice-list date filter and bulk print (batch).
 * Products: TIN, T.P 100, GST 0, cost 80 → n pieces = Invoice Value 100·n, cost 80·n.
 */
describe('Invoice edits, date filter and batch (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let adminToken: string;
  let admin2Token: string;
  let bookerToken: string;
  let adminBToken: string;
  let superToken: string;
  let shop: Id;
  let shopB: Id;
  let tin: Id;
  let tin2: Id;
  let retiredLater: Id;
  let inactive: Id;
  let today: string;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const line = (product: Id, qtyPcs: number, patch: object = {}) => ({
    productId: product.id,
    qtyPcs,
    retailPrice: '120',
    tradePrice: '100',
    gstRate: '0',
    toRate: '0',
    ...patch,
  });
  const create = async (items: object[], patch: object = {}, forShop: Id = shop) =>
    (
      await http()
        .post('/api/invoices')
        .set(auth(adminToken))
        .send({ shopId: forShop.id, invoiceDate: today, items, ...patch })
        .expect(201)
    ).body as { id: string; invoiceNumber: string; createdAt: string; payableValue: string };
  const edit = (id: string, body: object, token = adminToken) =>
    http().put(`/api/invoices/${id}`).set(auth(token)).send(body);
  const editBody = (items: object[], patch: object = {}) => ({
    invoiceDate: today,
    items,
    reason: 'Customer returned 4 pieces',
    ...patch,
  });
  const getInvoice = (id: string, token = adminToken) =>
    http().get(`/api/invoices/${id}`).set(auth(token));
  const ledger = async (shopId = shop.id) =>
    (await http().get(`/api/shops/${shopId}/ledger?pageSize=100`).set(auth(adminToken)).expect(200))
      .body as { items: Entry[]; balance: { outstandingBalance: string } };
  const pay = (amount: string) =>
    http()
      .post(`/api/shops/${shop.id}/payments`)
      .set(auth(adminToken))
      .send({ amount, paymentDate: today, method: 'CASH' })
      .expect(201);
  const details = (res: Res) => res.body.details as { path: string; message: string }[];

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const f = fixtures(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Ali Akbar Traders' });
    const orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    const admin2 = await createUser(t.prisma, {
      organizationId: orgA.id,
      role: 'ADMIN',
      name: 'Second Admin',
    });
    const booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const superUser = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });
    const area = await f.area(orgA.id, 'Saddar');
    const areaB = await f.area(orgB.id, 'B Area');
    shop = await f.shop(orgA.id, 'Bilal Store', area.id, booker.id);
    shopB = await f.shop(orgB.id, 'B Store', areaB.id, null);
    tin = await f.product(orgA.id, 'Tin One');
    tin2 = await f.product(orgA.id, 'Tin Two');
    retiredLater = await f.product(orgA.id, 'Retired Later');
    inactive = await f.product(orgA.id, 'Inactive Item', false);

    adminToken = (await login(t.app, admin.email)).accessToken;
    admin2Token = (await login(t.app, admin2.email)).accessToken;
    bookerToken = (await login(t.app, booker.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;
    superToken = (await login(t.app, superUser.email)).accessToken;
    today = (
      await http().get(`/api/invoices/draft?shopId=${shop.id}`).set(auth(adminToken)).expect(200)
    ).body.invoiceDate;
  });

  afterAll(() => t.close());

  describe('editing a confirmed invoice', () => {
    let inv: { id: string; invoiceNumber: string; createdAt: string };
    let edited: Res;

    beforeAll(async () => {
      inv = await create([line(tin, 10)], { notes: 'first' });
    });

    it('opens the edit form with the saved values (GET /:id/edit-draft)', async () => {
      const res = await http()
        .get(`/api/invoices/${inv.id}/edit-draft`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body).toMatchObject({
        shop: { id: shop.id, name: 'Bilal Store' },
        proposedInvoiceNumber: inv.invoiceNumber,
        invoiceDate: today,
        edit: {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          editCount: 0,
          payableValue: '1000.00',
          notes: 'first',
        },
        items: [
          {
            product: { id: tin.id, name: 'Tin One', invoiceCostPrice: '80.00' },
            qtyPcs: 10,
            values: { retailPrice: '120.00', tradePrice: '100.00', gstRate: '0', toRate: '0' },
          },
        ],
      });
    });

    it('requires a reason (400) and refuses (422) an edit that changes nothing', async () => {
      const noReason = await edit(inv.id, { invoiceDate: today, items: [line(tin, 6)] }).expect(
        400,
      );
      expect(details(noReason).map((d) => d.path)).toContain('reason');
      const blank = await edit(inv.id, editBody([line(tin, 6)], { reason: '   ' })).expect(400);
      expect(details(blank).map((d) => d.path)).toContain('reason');
      const same = await edit(inv.id, editBody([line(tin, 10)], { notes: 'first' })).expect(422);
      expect(same.body.message).toMatch(/Nothing was changed/);
    });

    it('recalculates on the server and keeps number, id, creation date and creator', async () => {
      edited = await edit(
        inv.id,
        editBody([line(tin, 6), line(tin2, 1, { tradePrice: '50' })], {
          // client-sent totals and identity are ignored
          grandTotal: '1.00',
          payableValue: '1.00',
          invoiceNumber: 'HACK',
          shopId: shopB.id,
          organizationId: orgA.id,
          notes: 'returned',
        }),
      ).expect(200);
      expect(edited.body).toMatchObject({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        createdAt: inv.createdAt,
        status: 'CONFIRMED',
        shop: { id: shop.id, name: 'Bilal Store' },
        itemCount: 2,
        grandTotal: '650.00',
        payableValue: '650.00',
        totalCost: '560.00',
        notes: 'returned',
        editCount: 1,
        lastEditedBy: { name: expect.any(String) },
      });
      expect(edited.body.lastEditedAt).toEqual(expect.any(String));
      expect(edited.body.items.map((i: { productName: string }) => i.productName)).toEqual([
        'Tin One',
        'Tin Two',
      ]);
    });

    it('records an audit revision: who, when, reason, previous → new values', async () => {
      const res = await getInvoice(inv.id).expect(200);
      expect(res.body.revisions).toHaveLength(1);
      const [rev] = res.body.revisions;
      expect(rev).toMatchObject({
        revisionNo: 1,
        reason: 'Customer returned 4 pieces',
        previousPayableValue: '1000.00',
        newPayableValue: '650.00',
        editedBy: { id: expect.any(String) },
      });
      const labels = Object.fromEntries(
        rev.changes.map((c: { label: string; from: string; to: string }) => [
          c.label,
          [c.from, c.to],
        ]),
      );
      expect(labels).toMatchObject({
        Notes: ['first', 'returned'],
        'Grand total': ['1000.00', '650.00'],
        'Invoice value': ['1000.00', '650.00'],
        'Tin One — Qty (Pcs)': ['10', '6'],
        'Tin One — Gross value': ['1000.00', '600.00'],
      });
      expect(labels['Tin Two (added)'][0]).toBe('—');
    });

    it('ledger: original debit kept, old value reversed, new value debited (no duplicate)', async () => {
      const { items, balance } = await ledger();
      const forInvoice = items.filter((e) => e.invoice?.id === inv.id);
      expect(forInvoice.map((e) => [e.type, e.debit, e.credit]).sort()).toEqual(
        [
          ['INVOICE', '1000.00', '0.00'],
          ['INVOICE_EDIT', '650.00', '0.00'],
          ['INVOICE_EDIT_REVERSAL', '0.00', '1000.00'],
        ].sort(),
      );
      expect(forInvoice.every((e) => e.invoice?.invoiceNumber === inv.invoiceNumber)).toBe(true);
      expect(balance.outstandingBalance).toBe('650.00');
      // newest first: the reversal is the last posting, ending at the corrected balance
      expect(items[0]).toMatchObject({ type: 'INVOICE_EDIT_REVERSAL', runningBalance: '650.00' });
      expect(items[1]).toMatchObject({ type: 'INVOICE_EDIT', runningBalance: '1650.00' });
      expect(items[0].notes).toMatch(/edited \(revision 1\): Customer returned 4 pieces/);
    });

    it('dashboard, sales report and profit show the edited value', async () => {
      const dash = (await http().get('/api/dashboard/summary').set(auth(adminToken)).expect(200))
        .body;
      expect(dash).toMatchObject({ monthlySales: '650.00', monthlyInvoiceCount: 1 });
      const sales = (
        await http()
          .get(`/api/reports/sales?from=${today}&to=${today}`)
          .set(auth(adminToken))
          .expect(200)
      ).body;
      expect(sales.totals).toMatchObject({ invoiceCount: 1, payableValue: '650.00' });
      const profit = (
        await http()
          .get(`/api/profit/summary?from=${today}&to=${today}`)
          .set(auth(adminToken))
          .expect(200)
      ).body;
      // 650 − cost (6 × 80 + 1 × 80)
      expect(profit.grossProfit).toBe('90.00');
    });

    it('a second edit adds revision 2 and reverses the previous edited value', async () => {
      const res = await edit(
        inv.id,
        editBody([line(tin, 6), line(tin2, 1, { tradePrice: '50' })], {
          advanceTax: '25',
          notes: 'returned',
          reason: 'Advance tax was missed',
        }),
        admin2Token,
      ).expect(200);
      expect(res.body).toMatchObject({
        payableValue: '675.00',
        editCount: 2,
        lastEditedBy: { name: 'Second Admin' },
      });
      expect(res.body.revisions.map((r: { revisionNo: number }) => r.revisionNo)).toEqual([2, 1]);
      const { items, balance } = await ledger();
      expect(balance.outstandingBalance).toBe('675.00');
      expect(items.slice(0, 2).map((e) => [e.type, e.debit, e.credit])).toEqual([
        ['INVOICE_EDIT_REVERSAL', '0.00', '650.00'],
        ['INVOICE_EDIT', '675.00', '0.00'],
      ]);
    });

    it('cancelling an edited invoice reverses its current value; it is then not editable', async () => {
      await http()
        .post(`/api/invoices/${inv.id}/cancel`)
        .set(auth(adminToken))
        .send({ reason: 'Wrong shop' })
        .expect(200);
      const { items, balance } = await ledger();
      expect(items[0]).toMatchObject({ type: 'INVOICE_REVERSAL', credit: '675.00' });
      expect(balance.outstandingBalance).toBe('0.00');
      const res = await edit(inv.id, editBody([line(tin, 1)])).expect(409);
      expect(res.body.message).toMatch(/cancelled invoice cannot be edited/);
      await http().get(`/api/invoices/${inv.id}/edit-draft`).set(auth(adminToken)).expect(409);
    });
  });

  describe('edit rules', () => {
    it('kept products use the invoiced facts even if since deactivated; new products must be active', async () => {
      const inv = await create([line(retiredLater, 2)]);
      await t.prisma.product.update({
        where: { id: retiredLater.id },
        data: { isActive: false, invoiceCostPrice: '999', name: 'Renamed' },
      });
      const res = await edit(inv.id, editBody([line(retiredLater, 3)])).expect(200);
      expect(res.body.items[0]).toMatchObject({
        productName: 'Retired Later',
        invoiceCostPrice: '80.00',
        qtyPcs: 3,
      });
      const bad = await edit(inv.id, editBody([line(retiredLater, 3), line(inactive, 1)])).expect(
        422,
      );
      expect(details(bad)).toContainEqual({
        path: 'items.1.productId',
        message: 'This product is inactive',
      });
    });

    it('refuses an edit that would make the shop balance negative (payment safety)', async () => {
      const inv = await create([line(tin, 10)]);
      // the shop pays its whole balance, including this invoice
      const owed = (await ledger()).balance.outstandingBalance;
      await pay(owed);
      const res = await edit(inv.id, editBody([line(tin, 4)])).expect(409);
      expect(res.body.message).toMatch(/balance would become -600\.00/);
      // nothing changed: invoice, items, revisions, ledger
      const after = await getInvoice(inv.id).expect(200);
      expect(after.body).toMatchObject({ payableValue: '1000.00', editCount: 0, revisions: [] });
      expect((await ledger()).balance.outstandingBalance).toBe('0.00');
      // increasing the value is always allowed
      await edit(inv.id, editBody([line(tin, 12)])).expect(200);
      expect((await ledger()).balance.outstandingBalance).toBe('200.00');
    });

    it('an empty invoice or a bad date is 400', async () => {
      const inv = await create([line(tin, 1)]);
      await edit(inv.id, editBody([])).expect(400);
      await edit(inv.id, editBody([line(tin, 1)], { invoiceDate: '2026-02-30' })).expect(400);
    });

    it('the database refuses invoice / item changes outside an edit, and revision changes', async () => {
      const inv = await create([line(tin, 1)]);
      await expect(
        t.prisma.invoice.update({ where: { id: inv.id }, data: { grandTotal: '1' } }),
      ).rejects.toThrow(/can only be cancelled/);
      await expect(
        t.prisma.invoiceItem.deleteMany({ where: { invoiceId: inv.id } }),
      ).rejects.toThrow(/append-only/);
      await edit(inv.id, editBody([line(tin, 2)])).expect(200);
      await expect(
        t.prisma.invoiceRevision.updateMany({
          where: { invoiceId: inv.id },
          data: { reason: 'x' },
        }),
      ).rejects.toThrow();
      await expect(
        t.prisma.invoiceRevision.deleteMany({ where: { invoiceId: inv.id } }),
      ).rejects.toThrow();
      // even inside an "edit" session the invoice number / shop cannot change
      await expect(
        t.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('mytraders.invoice_edit', 'on', true)`;
          await tx.invoice.update({ where: { id: inv.id }, data: { invoiceNumber: 'X-1' } });
        }),
      ).rejects.toThrow(/can only be cancelled/);
    });

    it('two simultaneous edits of one invoice are serialized (revisions 1 and 2)', async () => {
      const inv = await create([line(tin, 5)]);
      const results = await Promise.all([
        edit(inv.id, editBody([line(tin, 7)], { reason: 'Edit A' })),
        edit(inv.id, editBody([line(tin, 8)], { reason: 'Edit B' })),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 200]);
      const res = await getInvoice(inv.id).expect(200);
      expect(res.body.revisions.map((r: { revisionNo: number }) => r.revisionNo)).toEqual([2, 1]);
      expect(res.body.revisions[0].previousPayableValue).toBe(
        res.body.revisions[1].newPayableValue,
      );
    });
  });

  describe('permissions and tenant isolation', () => {
    let inv: { id: string };
    beforeAll(async () => {
      inv = await create([line(tin, 1)]);
    });

    it('only an Admin of the organization can edit or open the edit form', async () => {
      await edit(inv.id, editBody([line(tin, 2)]), bookerToken).expect(403);
      await edit(inv.id, editBody([line(tin, 2)]), superToken).expect(403);
      await http().get(`/api/invoices/${inv.id}/edit-draft`).set(auth(bookerToken)).expect(403);
      await http()
        .put(`/api/invoices/${inv.id}`)
        .send(editBody([line(tin, 2)]))
        .expect(401);
    });

    it("another organization's Admin gets 404 and changes nothing", async () => {
      await edit(inv.id, editBody([line(tin, 2)]), adminBToken).expect(404);
      await http().get(`/api/invoices/${inv.id}/edit-draft`).set(auth(adminBToken)).expect(404);
      const res = await getInvoice(inv.id).expect(200);
      expect(res.body).toMatchObject({ editCount: 0, payableValue: '100.00' });
    });

    it("cannot put another organization's product on the invoice", async () => {
      const productB = await fixtures(t.prisma).product(
        (await t.prisma.shop.findUniqueOrThrow({ where: { id: shopB.id } })).organizationId,
        'B Product',
      );
      const res = await edit(inv.id, editBody([line(productB, 1)])).expect(422);
      expect(details(res)).toContainEqual({
        path: 'items.0.productId',
        message: 'Product not found',
      });
    });

    it('revisions are only visible inside the organization', async () => {
      const count = await t.prisma.invoiceRevision.count({ where: { organizationId: orgA.id } });
      expect(count).toBeGreaterThan(0);
      await getInvoice(inv.id, adminBToken).expect(404);
    });
  });

  describe('invoice list: date filter', () => {
    const ids: Record<string, string> = {};
    const list = async (query: string) =>
      (await http().get(`/api/invoices${query}`).set(auth(adminToken)).expect(200)).body as {
        items: { id: string; invoiceDate: string; shop: { name: string }; editCount: number }[];
        total: number;
      };

    beforeAll(async () => {
      ids.sep = (await create([line(tin, 1)], { invoiceDate: '2026-09-15' })).id;
      ids.oct1 = (await create([line(tin, 1)], { invoiceDate: '2026-10-01' })).id;
      ids.oct3 = (await create([line(tin, 1)], { invoiceDate: '2026-10-03' })).id;
    });

    it('from / to are inclusive on the invoice date', async () => {
      const res = await list('?from=2026-10-01&to=2026-10-03');
      expect(res.items.map((i) => i.id).sort()).toEqual([ids.oct1, ids.oct3].sort());
      const until = await list('?to=2026-09-30');
      expect(until.items.map((i) => i.id)).toEqual([ids.sep]);
      const from = await list('?from=2026-10-03&to=2026-10-03');
      expect(from.items.map((i) => i.id)).toEqual([ids.oct3]);
    });

    it('"Today" (from = to = today) lists only today\'s invoices', async () => {
      const res = await list(`?from=${today}&to=${today}`);
      expect(res.total).toBeGreaterThan(0);
      expect(res.items.every((i) => i.invoiceDate === today)).toBe(true);
    });

    it('combines with search and status', async () => {
      const res = await list('?from=2026-09-01&to=2026-10-03&q=bilal&status=CONFIRMED');
      expect(res.total).toBe(3);
      expect((await list('?from=2026-09-01&to=2026-10-03&status=CANCELLED')).total).toBe(0);
      expect((await list('?from=2026-09-01&to=2026-10-03&q=nobody')).total).toBe(0);
    });

    it('rejects a bad date or from after to (400)', async () => {
      await http().get('/api/invoices?from=2026-13-01').set(auth(adminToken)).expect(400);
      await http()
        .get('/api/invoices?from=2026-10-05&to=2026-10-01')
        .set(auth(adminToken))
        .expect(400);
    });
  });

  describe('bulk print (GET /invoices/batch)', () => {
    let a: { id: string; invoiceNumber: string };
    let b: { id: string; invoiceNumber: string };
    beforeAll(async () => {
      a = await create([line(tin, 1)]);
      b = await create([line(tin2, 2)]);
    });

    it('returns the full invoices in the order asked', async () => {
      const res = await http()
        .get(`/api/invoices/batch?ids=${b.id},${a.id}`)
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.map((i: { invoiceNumber: string }) => i.invoiceNumber)).toEqual([
        b.invoiceNumber,
        a.invoiceNumber,
      ]);
      expect(res.body[0].items[0]).toMatchObject({ productName: 'Tin Two', qtyPcs: 2 });
      expect(res.body[0]).toHaveProperty('shopSnapshot');
    });

    it("refuses another organization's invoice (404), bookers (403) and bad ids (400)", async () => {
      const foreign = (
        await http()
          .post('/api/invoices')
          .set(auth(adminBToken))
          .send({
            shopId: shopB.id,
            invoiceDate: today,
            items: [
              line(await t.prisma.product.findFirstOrThrow({ where: { name: 'B Product' } }), 1),
            ],
          })
          .expect(201)
      ).body;
      await http()
        .get(`/api/invoices/batch?ids=${a.id},${foreign.id}`)
        .set(auth(adminToken))
        .expect(404);
      await http().get(`/api/invoices/batch?ids=${a.id}`).set(auth(bookerToken)).expect(403);
      await http().get('/api/invoices/batch?ids=nope').set(auth(adminToken)).expect(400);
      await http().get('/api/invoices/batch').set(auth(adminToken)).expect(400);
    });
  });
});
