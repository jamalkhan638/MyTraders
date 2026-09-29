import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

describe('Organization settings (e2e)', () => {
  let t: TestApp;
  let orgA: { id: string };
  let orgB: { id: string };
  let adminA: string;
  let adminB: string;
  let bookerA: string;
  let superAdmin: string;

  const http = () => request(t.app.getHttpServer());
  const get = (token: string) =>
    http().get('/api/organization/settings').set('Authorization', `Bearer ${token}`);
  const patch = (token: string, body: object) =>
    http().patch('/api/organization/settings').set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const login_ = async (
      organizationId: string | null,
      role: 'ADMIN' | 'ORDER_BOOKER' | 'SUPER_ADMIN',
    ) =>
      (await login(t.app, (await createUser(t.prisma, { organizationId, role })).email))
        .accessToken;
    adminA = await login_(orgA.id, 'ADMIN');
    adminB = await login_(orgB.id, 'ADMIN');
    bookerA = await login_(orgA.id, 'ORDER_BOOKER');
    superAdmin = await login_(null, 'SUPER_ADMIN');
  });

  afterAll(() => t.close());

  describe('GET', () => {
    it('returns the settings of the caller organization with defaults', async () => {
      const res = await get(adminA).expect(200);
      expect(res.body).toMatchObject({
        id: orgA.id,
        name: 'Org A',
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        invoicePrefix: 'INV-',
        invoiceNumberDigits: 6,
        orderPrefix: 'ORD-',
        defaultTaxRate: '0',
        nextInvoiceNumber: 1,
        nextOrderNumber: 1,
        logoUrl: null,
      });
    });

    it('is Admin-only', async () => {
      await get(bookerA).expect(403);
      await get(superAdmin).expect(403);
      await http().get('/api/organization/settings').expect(401);
    });
  });

  describe('PATCH', () => {
    it('updates and persists the settings', async () => {
      const body = {
        name: 'Ali Akbar Traders',
        phone: '0345 1135938',
        address: 'Ali Plaza near Qureshi pump Iqbal Road',
        town: 'Abbottabad',
        ntn: 'C872686-1',
        strn: 'C-872886',
        logoUrl: 'https://example.com/logo.png',
        currency: 'pkr',
        timezone: 'Asia/Karachi',
        invoicePrefix: 'M-',
        invoiceNumberDigits: 8,
        orderPrefix: 'OB-',
        orderNumberDigits: 5,
        defaultTaxRate: '18',
      };
      const res = await patch(adminA, body).expect(200);
      expect(res.body).toMatchObject({ ...body, currency: 'PKR' });

      const reread = await get(adminA).expect(200);
      expect(reread.body).toMatchObject({ ...body, currency: 'PKR' });
    });

    it('clears optional fields with an empty string', async () => {
      await patch(adminA, { phone: '0300', logoUrl: 'https://example.com/a.png' }).expect(200);
      const res = await patch(adminA, { phone: '', logoUrl: '' }).expect(200);
      expect(res.body.phone).toBeNull();
      expect(res.body.logoUrl).toBeNull();
    });

    it('validates input', async () => {
      const res = await patch(adminA, {
        name: '  ',
        currency: 'RUPEES',
        timezone: 'Mars/Olympus',
        invoicePrefix: 'M #',
        invoiceNumberDigits: 40,
        defaultTaxRate: '120',
        logoUrl: 'javascript:alert(1)',
      }).expect(400);
      const paths = res.body.details.map((d: { path: string }) => d.path).sort();
      expect(paths).toEqual(
        [
          'currency',
          'defaultTaxRate',
          'invoiceNumberDigits',
          'invoicePrefix',
          'logoUrl',
          'name',
          'timezone',
        ].sort(),
      );
    });

    it('moves the next invoice number forward but never backwards', async () => {
      const forward = await patch(adminA, { nextInvoiceNumber: 124 }).expect(200);
      expect(forward.body.nextInvoiceNumber).toBe(124);

      const backward = await patch(adminA, { nextInvoiceNumber: 50 }).expect(422);
      expect(backward.body.message).toContain('cannot be lower than 124');
      expect((await get(adminA)).body.nextInvoiceNumber).toBe(124);
    });

    it('is Admin-only', async () => {
      await patch(bookerA, { name: 'Hacked' }).expect(403);
      await patch(superAdmin, { name: 'Hacked' }).expect(403);
    });
  });

  describe('tenant isolation', () => {
    it('never changes another organization, even if its id is sent in the body', async () => {
      const before = await get(adminB).expect(200);
      await patch(adminA, { id: orgB.id, organizationId: orgB.id, name: 'Only A Changed' }).expect(
        200,
      );

      expect((await get(adminA)).body).toMatchObject({ id: orgA.id, name: 'Only A Changed' });
      const after = await get(adminB).expect(200);
      expect(after.body).toEqual(before.body);
    });

    it('keeps invoice counters per organization', async () => {
      await patch(adminB, { nextInvoiceNumber: 7 }).expect(200);
      expect((await get(adminB)).body.nextInvoiceNumber).toBe(7);
      expect((await get(adminA)).body.nextInvoiceNumber).toBe(124);
    });
  });
});
