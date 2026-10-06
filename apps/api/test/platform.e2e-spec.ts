import request from 'supertest';
import { login, type LoggedIn } from './utils/auth';
import { createOrganization, createUser, TEST_PASSWORD } from './utils/factories';
import { fixtures } from './utils/fixtures';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

type Id = { id: string };

describe('Platform tenant management (e2e)', () => {
  let t: TestApp;
  let superToken: string;
  let otherAdmin: LoggedIn; // a tenant Admin of an unrelated tenant
  let tenant: { id: string; adminId: string; adminEmail: string };
  let admin: LoggedIn;
  let booker: LoggedIn;
  let bookerId: string;
  let otherOrgId: string;
  let today: string;

  const http = () => request(t.app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = superToken) => http().get(`/api/${url}`).set(as(token));
  const post = (url: string, body: object = {}, token = superToken) =>
    http().post(`/api/${url}`).set(as(token)).send(body);
  const refresh = (cookie: string) => http().post('/api/auth/refresh').set('Cookie', cookie).send();

  /** Every business row of the tenant — must be identical before and after suspend / reactivate. */
  const businessSnapshot = async (organizationId: string) => {
    const where = { organizationId };
    return JSON.stringify(
      await Promise.all([
        t.prisma.area.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.shop.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.product.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.order.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.invoice.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.invoiceItem.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.shopLedgerEntry.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.payment.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.expense.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.expenseCategory.findMany({ where, orderBy: { id: 'asc' } }),
        t.prisma.organizationCounter.findMany({ where, orderBy: { key: 'asc' } }),
        t.prisma.user.findMany({
          where,
          orderBy: { id: 'asc' },
          select: { id: true, email: true, passwordHash: true, isActive: true, role: true },
        }),
      ]),
    );
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const superAdmin = await createUser(t.prisma, { organizationId: null, role: 'SUPER_ADMIN' });
    superToken = (await login(t.app, superAdmin.email)).accessToken;
    const other = await createOrganization(t.prisma, { name: 'Other Traders' });
    otherOrgId = other.id;
    const otherAdminUser = await createUser(t.prisma, { organizationId: other.id, role: 'ADMIN' });
    otherAdmin = await login(t.app, otherAdminUser.email);
    await fixtures(t.prisma).area(other.id, 'Other Area');
  });

  afterAll(() => t.close());

  describe('creating a tenant', () => {
    it('creates the tenant ACTIVE with its first Admin, counters and expense categories', async () => {
      const res = await post('platform/tenants', {
        name: 'Ali Akbar Traders',
        invoicePrefix: 'M-',
        invoiceNumberDigits: 8,
        admin: { name: 'Owner', email: 'Owner@AliAkbar.test', password: TEST_PASSWORD },
        // never trusted
        status: 'SUSPENDED',
        organizationId: otherOrgId,
      }).expect(201);
      expect(res.body).toMatchObject({
        name: 'Ali Akbar Traders',
        status: 'ACTIVE',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        invoicePrefix: 'M-',
        primaryAdmin: { name: 'Owner', email: 'owner@aliakbar.test' },
        counts: { users: 1, admins: 1, orderBookers: 0, shops: 0, products: 0, invoices: 0 },
        lastLoginAt: null,
        suspensionReason: null,
      });
      expect(res.body.id).not.toBe(otherOrgId);
      tenant = {
        id: res.body.id,
        adminId: res.body.primaryAdmin.id,
        adminEmail: 'owner@aliakbar.test',
      };
      expect(await t.prisma.expenseCategory.count({ where: { organizationId: tenant.id } })).toBe(
        9,
      );
      expect(
        await t.prisma.organizationCounter.count({ where: { organizationId: tenant.id } }),
      ).toBe(2);
    });

    it('the new Admin signs in to their own empty organization', async () => {
      admin = await login(t.app, tenant.adminEmail);
      const me = await get('auth/me', admin.accessToken).expect(200);
      expect(me.body).toMatchObject({ role: 'ADMIN', organization: { id: tenant.id } });
      const shops = await get('shops', admin.accessToken).expect(200);
      expect(shops.body.total).toBe(0);
    });

    it('refuses a used email (409 on admin.email) and invalid input (400)', async () => {
      const dup = await post('platform/tenants', {
        name: 'Copy',
        admin: { name: 'X', email: tenant.adminEmail, password: TEST_PASSWORD },
      }).expect(409);
      expect(dup.body.details).toEqual([
        { path: 'admin.email', message: 'This email is already used by another account' },
      ]);
      const bad = await post('platform/tenants', {
        name: ' ',
        currency: 'RUPEES',
        timezone: 'Mars/Base',
        admin: { name: '', email: 'nope', password: 'short' },
      }).expect(400);
      expect(bad.body.details.map((d: { path: string }) => d.path).sort()).toEqual(
        ['admin.email', 'admin.name', 'admin.password', 'currency', 'name', 'timezone'].sort(),
      );
      expect(await t.prisma.organization.count({ where: { name: 'Copy' } })).toBe(0);
    });
  });

  describe('tenant usage, list and details', () => {
    beforeAll(async () => {
      // the tenant works normally: area, shop, product, booker, an invoice and a payment
      const auth = admin.accessToken;
      const area = (await post('areas', { name: 'Saddar' }, auth).expect(201)).body as Id;
      const product = (
        await post(
          'products',
          {
            name: 'Ghee',
            type: 'TIN',
            retailPrice: '100',
            tradePrice: '90',
            invoiceCostPrice: '80',
            defaultTaxRate: '0',
          },
          auth,
        ).expect(201)
      ).body as Id;
      const user = await post(
        'users',
        { name: 'Ahmed', email: 'ahmed@aliakbar.test', password: TEST_PASSWORD },
        auth,
      ).expect(201);
      bookerId = user.body.id;
      const shop = (
        await post(
          'shops',
          { name: 'Bilal Store', areaId: area.id, assignedOrderBookerId: bookerId },
          auth,
        ).expect(201)
      ).body as Id;
      const settings = await get('organization/settings', auth).expect(200);
      today = new Intl.DateTimeFormat('en-CA', {
        timeZone: settings.body.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      await post(
        'invoices',
        {
          shopId: shop.id,
          invoiceDate: today,
          items: [
            {
              productId: product.id,
              qtyPcs: 3,
              retailPrice: '100',
              tradePrice: '90',
              gstRate: '0',
            },
          ],
        },
        auth,
      ).expect(201);
      await post(`shops/${shop.id}/payments`, { amount: '100', paymentDate: today }, auth).expect(
        201,
      );
      booker = await login(t.app, 'ahmed@aliakbar.test');
    });

    it('the summary cards count tenants by status', async () => {
      const res = await get('platform/summary').expect(200);
      expect(res.body).toEqual({
        totalTenants: 2,
        activeTenants: 2,
        suspendedTenants: 0,
        trialTenants: 0,
      });
    });

    it('lists tenants with Admin, counts and last sign-in; search and status filter', async () => {
      const res = await get('platform/tenants').expect(200);
      expect(res.body.total).toBe(2);
      const row = res.body.items.find((r: Id) => r.id === tenant.id);
      expect(row).toMatchObject({
        name: 'Ali Akbar Traders',
        status: 'ACTIVE',
        primaryAdmin: { email: tenant.adminEmail },
        counts: { users: 2, shops: 1, products: 1, invoices: 1 },
      });
      expect(row.lastLoginAt).toEqual(expect.any(String));
      const search = await get('platform/tenants?q=akbar').expect(200);
      expect(search.body.items.map((r: Id) => r.id)).toEqual([tenant.id]);
      const suspended = await get('platform/tenants?status=SUSPENDED').expect(200);
      expect(suspended.body.items).toEqual([]);
      await get('platform/tenants?status=CLOSED').expect(400);
    });

    it('details show identity, Admins and counts — never business records or amounts', async () => {
      const res = await get(`platform/tenants/${tenant.id}`).expect(200);
      expect(res.body.counts).toEqual({
        users: 2,
        admins: 1,
        orderBookers: 1,
        activeUsers: 2,
        shops: 1,
        products: 1,
        invoices: 1,
      });
      expect(res.body.admins).toEqual([
        expect.objectContaining({ id: tenant.adminId, email: tenant.adminEmail, isActive: true }),
      ]);
      const text = JSON.stringify(res.body);
      for (const secret of [
        'Bilal',
        'Saddar',
        'Ghee',
        'Ahmed',
        '270.00',
        '170.00',
        'passwordHash',
      ]) {
        expect(text).not.toContain(secret);
      }
      await get('platform/tenants/00000000-0000-4000-8000-000000000000').expect(404);
      await get('platform/tenants/not-a-uuid').expect(400);
    });
  });

  describe('suspend and reactivate', () => {
    let before: string;
    let otherBefore: string;

    it('suspending needs a reason', async () => {
      await post(`platform/tenants/${tenant.id}/suspend`, {}).expect(400);
    });

    it('suspension blocks every user of the tenant at once, existing tokens included', async () => {
      before = await businessSnapshot(tenant.id);
      otherBefore = await businessSnapshot(otherOrgId);
      // both users are signed in and working
      await get('shops', admin.accessToken).expect(200);
      await get('booker/shops', booker.accessToken).expect(200);

      const res = await post(`platform/tenants/${tenant.id}/suspend`, {
        reason: 'Unpaid since August',
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'SUSPENDED',
        suspensionReason: 'Unpaid since August',
        statusChangedBy: { name: expect.any(String) },
      });

      // the very next request with the old access tokens fails
      for (const [url, token] of [
        ['shops', admin.accessToken],
        ['invoices', admin.accessToken],
        ['dashboard/summary', admin.accessToken],
        ['auth/me', admin.accessToken],
        ['booker/shops', booker.accessToken],
        ['orders', booker.accessToken],
      ] as const) {
        const blocked = await get(url, token);
        expect(`${url} ${blocked.status}`).toBe(`${url} 401`);
      }
      // refresh tokens were revoked and cannot start a new session
      await refresh(admin.refreshCookie).expect(401);
      await refresh(booker.refreshCookie).expect(401);
      const active = await t.prisma.refreshToken.count({
        where: { revokedAt: null, user: { organizationId: tenant.id } },
      });
      expect(active).toBe(0);
      // and nobody can sign in
      const signIn = await http()
        .post('/api/auth/login')
        .send({ email: tenant.adminEmail, password: TEST_PASSWORD })
        .expect(401);
      expect(signIn.body.message).toBe('Your organization is suspended');
    });

    it('suspending twice is a conflict; the summary counts it', async () => {
      await post(`platform/tenants/${tenant.id}/suspend`, { reason: 'Again' }).expect(409);
      const summary = await get('platform/summary').expect(200);
      expect(summary.body).toMatchObject({ activeTenants: 1, suspendedTenants: 1 });
    });

    it('the other tenant keeps working; tenant data is untouched while suspended', async () => {
      await get('areas', otherAdmin.accessToken).expect(200);
      expect(await businessSnapshot(tenant.id)).toBe(before);
      expect(await businessSnapshot(otherOrgId)).toBe(otherBefore);
    });

    it('reactivation restores access (sign in again) with every record intact', async () => {
      const res = await post(`platform/tenants/${tenant.id}/activate`).expect(200);
      expect(res.body).toMatchObject({ status: 'ACTIVE', suspensionReason: null });
      await post(`platform/tenants/${tenant.id}/activate`).expect(409);
      // revoked sessions stay revoked; users sign in again
      await refresh(admin.refreshCookie).expect(401);
      admin = await login(t.app, tenant.adminEmail);
      booker = await login(t.app, 'ahmed@aliakbar.test');
      const shops = await get('shops', admin.accessToken).expect(200);
      expect(shops.body.items.map((s: { name: string }) => s.name)).toEqual(['Bilal Store']);
      expect(shops.body.items[0].outstandingBalance).toBe('170.00');
      await get('booker/shops', booker.accessToken).expect(200);
      expect(await businessSnapshot(tenant.id)).toBe(before);
    });

    it('a legacy TRIAL tenant can be activated', async () => {
      const trial = await createOrganization(t.prisma, { name: 'Trial Co', status: 'TRIAL' });
      const res = await post(`platform/tenants/${trial.id}/activate`).expect(200);
      expect(res.body.status).toBe('ACTIVE');
      await post('platform/tenants/00000000-0000-4000-8000-000000000000/activate').expect(404);
    });
  });

  describe('resetting a tenant Admin password', () => {
    it("sets a new password and ends the Admin's sessions", async () => {
      await post(`platform/tenants/${tenant.id}/admins/${tenant.adminId}/password`, {
        password: 'NewOwner@2026',
      }).expect(204);
      await refresh(admin.refreshCookie).expect(401);
      await http()
        .post('/api/auth/login')
        .send({ email: tenant.adminEmail, password: TEST_PASSWORD })
        .expect(401);
      admin = await login(t.app, tenant.adminEmail, 'NewOwner@2026');
    });

    it("only Admins of that tenant: a booker, another tenant's Admin or a bad password are refused", async () => {
      await post(`platform/tenants/${tenant.id}/admins/${bookerId}/password`, {
        password: 'Booker@2026x',
      }).expect(404);
      const otherAdminId = (await get('auth/me', otherAdmin.accessToken)).body.id;
      await post(`platform/tenants/${tenant.id}/admins/${otherAdminId}/password`, {
        password: 'Other@2026xx',
      }).expect(404);
      await post(`platform/tenants/${tenant.id}/admins/${tenant.adminId}/password`, {
        password: 'short',
      }).expect(400);
    });
  });

  describe('permissions', () => {
    const platformRoutes = (id: string, userId: string): [string, string, object?][] => [
      ['get', 'platform/summary'],
      ['get', 'platform/tenants'],
      ['get', `platform/tenants/${id}`],
      [
        'post',
        'platform/tenants',
        { name: 'Hack', admin: { name: 'H', email: 'h@hack.test', password: TEST_PASSWORD } },
      ],
      ['post', `platform/tenants/${id}/activate`],
      ['post', `platform/tenants/${id}/suspend`, { reason: 'Hostile takeover' }],
      ['post', `platform/tenants/${id}/admins/${userId}/password`, { password: 'Hacked@12345' }],
    ];

    it.each(['tenant Admin', 'Order Booker', 'other tenant Admin'] as const)(
      '%s cannot use any platform route (403); anonymous gets 401',
      async (who) => {
        const token =
          who === 'tenant Admin'
            ? admin.accessToken
            : who === 'Order Booker'
              ? booker.accessToken
              : otherAdmin.accessToken;
        // even targeting another tenant or their own
        for (const target of [tenant.id, otherOrgId]) {
          for (const [method, url, body] of platformRoutes(target, tenant.adminId)) {
            const req = method === 'get' ? get(url, token) : post(url, body, token);
            const res = await req;
            expect(`${method} ${url} ${res.status}`).toBe(`${method} ${url} 403`);
            const anonymous = await (method === 'get'
              ? http().get(`/api/${url}`)
              : http()
                  .post(`/api/${url}`)
                  .send(body ?? {}));
            expect(anonymous.status).toBe(401);
          }
        }
        // nothing changed
        const detail = await get(`platform/tenants/${tenant.id}`).expect(200);
        expect(detail.body.status).toBe('ACTIVE');
        expect(await t.prisma.organization.count({ where: { name: 'Hack' } })).toBe(0);
      },
    );

    it('the Super Admin cannot use tenant operational APIs (403)', async () => {
      const urls: [string, string, object?][] = [
        ['get', 'shops'],
        ['get', 'areas'],
        ['get', 'products'],
        ['get', 'orders'],
        ['get', 'invoices'],
        ['get', 'expenses'],
        ['get', 'ledger/market-credit'],
        ['get', 'dashboard/summary'],
        ['get', 'reports/sales'],
        ['get', 'reports/shops'],
        ['get', 'profit/summary'],
        ['get', 'users'],
        ['get', 'organization/settings'],
        ['get', 'booker/shops'],
        ['post', 'areas', { name: 'Platform area' }],
        ['post', 'expenses', { categoryId: tenant.id, amount: '1', expenseDate: today }],
      ];
      for (const [method, url, body] of urls) {
        const res = method === 'get' ? await get(url) : await post(url, body);
        expect(`${method} ${url} ${res.status}`).toBe(`${method} ${url} 403`);
      }
    });

    it('tenants remain isolated from each other', async () => {
      const mine = await get('areas', admin.accessToken).expect(200);
      expect(mine.body.items.map((a: { name: string }) => a.name)).toEqual(['Saddar']);
      const theirs = await get('areas', otherAdmin.accessToken).expect(200);
      expect(theirs.body.items.map((a: { name: string }) => a.name)).toEqual(['Other Area']);
      const otherArea = theirs.body.items[0].id;
      await get(`areas/${otherArea}`, admin.accessToken).expect(404);
    });
  });
});
