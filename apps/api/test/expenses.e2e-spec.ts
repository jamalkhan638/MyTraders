import { DEFAULT_EXPENSE_CATEGORIES } from '@mytraders/shared-types';
import request from 'supertest';
import { createOrganizationWithAdmin } from '../scripts/lib/organizations';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };
type Res = request.Response;

describe('Expenses (e2e)', () => {
  let t: TestApp;
  let orgA: Id;
  let orgB: Id;
  let admin: Id & { name: string };
  let adminToken: string;
  let adminBToken: string;
  let bookerToken: string;
  let superToken: string;
  let fuel: Id;
  let salary: Id;
  let rent: Id;
  let closed: Id;
  let categoryB: Id;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const create = (body: object, token = adminToken) =>
    http().post('/api/expenses').set(auth(token)).send(body);
  const update = (id: string, body: object, token = adminToken) =>
    http().patch(`/api/expenses/${id}`).set(auth(token)).send(body);
  const list = (query = '', token = adminToken) =>
    http().get(`/api/expenses${query}`).set(auth(token));
  const summary = (query = '', token = adminToken) =>
    http().get(`/api/expenses/summary${query}`).set(auth(token));
  const voidIt = (id: string, body: object, token = adminToken) =>
    http().post(`/api/expenses/${id}/void`).set(auth(token)).send(body);
  const expense = (category: Id, amount: string, expenseDate: string, extra: object = {}) =>
    create({ categoryId: category.id, amount, expenseDate, ...extra });
  const paths = (res: Res) => res.body.details.map((d: { path: string }) => d.path);
  const category = (organizationId: string, name: string, isActive = true) =>
    t.prisma.expenseCategory.create({
      data: { organizationId, name, nameNormalized: name.toLowerCase(), isActive },
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    admin = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN', name: 'Owner' });
    const booker = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    const adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    const superUser = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });
    fuel = await category(orgA.id, 'Fuel');
    salary = await category(orgA.id, 'Salary');
    rent = await category(orgA.id, 'Rent');
    closed = await category(orgA.id, 'Old Category', false);
    categoryB = await category(orgB.id, 'Fuel');
    adminToken = (await login(t.app, (admin as unknown as { email: string }).email)).accessToken;
    bookerToken = (await login(t.app, booker.email)).accessToken;
    adminBToken = (await login(t.app, adminB.email)).accessToken;
    superToken = (await login(t.app, superUser.email)).accessToken;
  });

  afterAll(() => t.close());

  describe('create', () => {
    it('records an expense with category, amount, date, description and reference', async () => {
      const res = await expense(fuel, '2500.50', '2025-09-01', {
        description: 'Diesel for the van',
        reference: 'PSO-114',
        organizationId: orgB.id,
      }).expect(201);
      expect(res.body).toMatchObject({
        category: { id: fuel.id, name: 'Fuel', isActive: true },
        amount: '2500.50',
        expenseDate: '2025-09-01',
        description: 'Diesel for the van',
        reference: 'PSO-114',
        status: 'ACTIVE',
        createdBy: { id: admin.id, name: 'Owner' },
        updatedBy: null,
      });
      const stored = await t.prisma.expense.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.organizationId).toBe(orgA.id);
    });

    it.each([
      ['a zero amount', { amount: '0' }, 'amount'],
      ['a negative amount', { amount: '-10' }, 'amount'],
      ['three decimals', { amount: '10.005' }, 'amount'],
      ['a number instead of a string', { amount: 10 }, 'amount'],
      ['a missing amount', { amount: undefined }, 'amount'],
      ['an invalid date', { expenseDate: '2025-02-30' }, 'expenseDate'],
      ['a missing category', { categoryId: undefined }, 'categoryId'],
    ])('rejects %s (400)', async (_label, patch, path) => {
      const res = await create({
        categoryId: fuel.id,
        amount: '100',
        expenseDate: '2025-09-01',
        ...patch,
      }).expect(400);
      expect(paths(res)).toEqual([path]);
    });

    it('rejects a future date (422) but allows backdating', async () => {
      const res = await expense(fuel, '100', '2999-01-01').expect(422);
      expect(res.body.details).toEqual([
        { path: 'expenseDate', message: 'The date cannot be in the future' },
      ]);
      await expense(fuel, '100', '2020-01-15').expect(201);
    });

    it("rejects an inactive category and another organization's category (422)", async () => {
      const inactive = await expense(closed, '100', '2025-09-01').expect(422);
      expect(inactive.body.details).toEqual([
        { path: 'categoryId', message: 'This expense category is inactive' },
      ]);
      const foreign = await expense(categoryB, '100', '2025-09-01').expect(422);
      expect(foreign.body.details).toEqual([
        { path: 'categoryId', message: 'Expense category not found' },
      ]);
    });
  });

  describe('edit and void', () => {
    let id: string;

    beforeAll(async () => {
      id = (await expense(salary, '30000', '2025-08-31', { description: 'August salary' })).body.id;
    });

    it('edits amount, date, category, description and records who edited', async () => {
      const res = await update(id, {
        amount: '31000.75',
        expenseDate: '2025-08-30',
        categoryId: rent.id,
        description: 'Shop rent',
        reference: '',
      }).expect(200);
      expect(res.body).toMatchObject({
        amount: '31000.75',
        expenseDate: '2025-08-30',
        category: { id: rent.id },
        description: 'Shop rent',
        reference: null,
        updatedBy: { id: admin.id },
      });
    });

    it('keeps a category deactivated later, but cannot switch to an inactive one', async () => {
      await t.prisma.expenseCategory.update({ where: { id: rent.id }, data: { isActive: false } });
      await update(id, { amount: '31000' }).expect(200); // still on Rent: fine
      await update(id, { categoryId: closed.id }).expect(422);
      await update(id, { expenseDate: '2999-01-01' }).expect(422);
      await update(id, { amount: '0' }).expect(400);
      await t.prisma.expenseCategory.update({ where: { id: rent.id }, data: { isActive: true } });
    });

    it('voids with a reason; a voided expense cannot be edited or voided again; never deleted', async () => {
      await voidIt(id, {}).expect(400);
      const res = await voidIt(id, { reason: 'Entered twice' }).expect(200);
      expect(res.body).toMatchObject({
        status: 'VOIDED',
        voidReason: 'Entered twice',
        voidedBy: { id: admin.id },
      });
      await voidIt(id, { reason: 'again' }).expect(409);
      await update(id, { amount: '1' }).expect(409);
      await expect(t.prisma.expense.delete({ where: { id } })).rejects.toThrow(/never deleted/);
      const voided = await list('?status=voided').expect(200);
      expect(voided.body.items.map((e: Id) => e.id)).toEqual([id]);
      expect(voided.body.totalAmount).toBe('31000.00');
    });

    it('returns 404 for an unknown id and 400 for a malformed id', async () => {
      await update('0199a000-0000-7000-8000-000000000000', { amount: '1' }).expect(404);
      await http().get('/api/expenses/not-a-uuid').set(auth(adminToken)).expect(400);
    });
  });

  describe('filters and totals', () => {
    beforeAll(async () => {
      // September 2025 (besides the 2,500.50 fuel expense on the 1st)
      await expense(fuel, '1200.25', '2025-09-10', { description: 'Petrol bike' });
      await expense(salary, '25000', '2025-09-30', {
        description: 'Helper salary',
        reference: 'SAL-9',
      });
      await expense(rent, '15000', '2025-09-15');
      // October 2025
      await expense(fuel, '999.99', '2025-10-01');
    });

    it('lists newest first with the total of everything matching (not just the page)', async () => {
      const res = await list('?from=2025-09-01&to=2025-09-30&pageSize=2').expect(200);
      expect(res.body.items.map((e: { expenseDate: string }) => e.expenseDate)).toEqual([
        '2025-09-30',
        '2025-09-15',
      ]);
      expect(res.body).toMatchObject({ total: 4, totalAmount: '43700.75' });
    });

    it('filters by category, by search text and by date range', async () => {
      const byCategory = await list(`?categoryId=${fuel.id}&from=2025-09-01&to=2025-09-30`).expect(
        200,
      );
      expect(byCategory.body).toMatchObject({ total: 2, totalAmount: '3700.75' });
      const search = await list('?q=salary').expect(200);
      expect(search.body.items.map((e: { description: string }) => e.description)).toEqual([
        'Helper salary',
      ]);
      const byReference = await list('?q=pso').expect(200);
      expect(byReference.body.items).toHaveLength(1);
      const october = await list('?from=2025-10-01&to=2025-10-31').expect(200);
      expect(october.body).toMatchObject({ total: 1, totalAmount: '999.99' });
      await list('?from=2025-10-02&to=2025-10-01').expect(400);
      await list('?from=01-10-2025').expect(400);
      await list('?status=deleted').expect(400);
    });

    it('summarises a period by category (voided excluded) — the Expenses term of Net Profit', async () => {
      const res = await summary('?from=2025-08-01&to=2025-09-30').expect(200);
      expect(res.body).toEqual({
        from: '2025-08-01',
        to: '2025-09-30',
        total: '43700.75',
        count: 4,
        byCategory: [
          { category: { id: fuel.id, name: 'Fuel' }, total: '3700.75', count: 2 },
          { category: { id: rent.id, name: 'Rent' }, total: '15000.00', count: 1 },
          { category: { id: salary.id, name: 'Salary' }, total: '25000.00', count: 1 },
        ],
      });
    });

    it('defaults to the current month (This Month Expenses)', async () => {
      const res = await summary().expect(200);
      expect(res.body.from).toMatch(/^\d{4}-\d{2}-01$/);
      expect(res.body.to.slice(0, 7)).toBe(res.body.from.slice(0, 7));
      expect(res.body.total).toBe('0.00');
    });

    it('adds exact decimals (0.10 + 0.20 = 0.30)', async () => {
      await expense(fuel, '0.10', '2025-07-01');
      await expense(fuel, '0.20', '2025-07-01');
      const res = await summary('?from=2025-07-01&to=2025-07-01').expect(200);
      expect(res.body.total).toBe('0.30');
    });
  });

  describe('default categories', () => {
    it('a new organization starts with the default expense categories', async () => {
      const { organization } = await createOrganizationWithAdmin(t.prisma, {
        name: 'Fresh Org',
        admin: { name: 'Fresh Admin', email: 'fresh@org.test', password: 'Password@123' },
      });
      const names = await t.prisma.expenseCategory.findMany({
        where: { organizationId: organization.id },
        select: { name: true },
      });
      expect(names.map((c) => c.name).sort()).toEqual([...DEFAULT_EXPENSE_CATEGORIES].sort());
    });
  });

  describe('permissions', () => {
    it('Order Bookers cannot use any expense or expense-category endpoint', async () => {
      const id = (await list()).body.items[0].id;
      await list('', bookerToken).expect(403);
      await summary('', bookerToken).expect(403);
      await create(
        { categoryId: fuel.id, amount: '1', expenseDate: '2025-09-01' },
        bookerToken,
      ).expect(403);
      await update(id, { amount: '1' }, bookerToken).expect(403);
      await voidIt(id, { reason: 'nope' }, bookerToken).expect(403);
      await http().get('/api/expense-categories').set(auth(bookerToken)).expect(403);
    });

    it('Super Admin is refused and anonymous calls get 401', async () => {
      await list('', superToken).expect(403);
      await http().get('/api/expenses').expect(401);
      await http().post('/api/expenses').send({}).expect(401);
    });
  });

  describe('tenant isolation', () => {
    it("Company B cannot see, edit or void Company A's expenses (404) and they stay unchanged", async () => {
      const a = (await list()).body.items[0];
      const listB = await list('', adminBToken).expect(200);
      expect(listB.body).toMatchObject({ total: 0, totalAmount: '0.00' });
      await http().get(`/api/expenses/${a.id}`).set(auth(adminBToken)).expect(404);
      await update(a.id, { amount: '1' }, adminBToken).expect(404);
      await voidIt(a.id, { reason: 'hostile' }, adminBToken).expect(404);
      const after = await t.prisma.expense.findUniqueOrThrow({ where: { id: a.id } });
      expect(after.amount.toFixed(2)).toBe(a.amount);
      expect(after.status).toBe('ACTIVE');
    });

    it("Company B's totals only count its own expenses", async () => {
      await create(
        { categoryId: categoryB.id, amount: '50', expenseDate: '2025-09-05' },
        adminBToken,
      ).expect(201);
      await create(
        { categoryId: fuel.id, amount: '50', expenseDate: '2025-09-05' },
        adminBToken,
      ).expect(422);
      const res = await summary('?from=2025-09-01&to=2025-09-30', adminBToken).expect(200);
      expect(res.body).toMatchObject({ total: '50.00', count: 1 });
    });
  });
});
