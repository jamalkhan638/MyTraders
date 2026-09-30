import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

const DALDA_TIN = {
  name: 'mbp 4.5Kg TIN',
  code: '4000000164',
  rateCode: '9020',
  retailPrice: '2180',
  tradePrice: '2102.50',
  costPrice: '2050.25',
  weight: '4.5',
  unit: 'KG',
  piecesPerCarton: 1,
};
const REQUIRED_ONLY = {
  name: 'Dalda Pouch 1x5',
  retailPrice: '1135',
  tradePrice: '1100',
  costPrice: '1050',
};

describe('Products (e2e)', () => {
  let t: TestApp;
  let orgA: { id: string };
  let orgB: { id: string };
  let adminA: string;
  let adminB: string;
  let bookerA: string;
  let superAdmin: string;

  const http = () => request(t.app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token: string, query = '') => http().get(`/api/products${query}`).set(auth(token));
  const create = (token: string, body: object) =>
    http().post('/api/products').set(auth(token)).send(body);
  const update = (token: string, id: string, body: object) =>
    http().patch(`/api/products/${id}`).set(auth(token)).send(body);
  const paths = (res: request.Response) =>
    res.body.details.map((d: { path: string }) => d.path).sort();

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    const tokenFor = async (
      organizationId: string | null,
      role: 'ADMIN' | 'ORDER_BOOKER' | 'SUPER_ADMIN',
    ) =>
      (await login(t.app, (await createUser(t.prisma, { organizationId, role })).email))
        .accessToken;
    adminA = await tokenFor(orgA.id, 'ADMIN');
    adminB = await tokenFor(orgB.id, 'ADMIN');
    bookerA = await tokenFor(orgA.id, 'ORDER_BOOKER');
    superAdmin = await tokenFor(null, 'SUPER_ADMIN');
  });

  afterAll(() => t.close());

  describe('create', () => {
    it('creates a product with all fields', async () => {
      const res = await create(adminA, DALDA_TIN).expect(201);
      expect(res.body).toMatchObject({
        name: 'mbp 4.5Kg TIN',
        code: '4000000164',
        rateCode: '9020',
        retailPrice: '2180.00',
        tradePrice: '2102.50',
        costPrice: '2050.25',
        weight: '4.5',
        unit: 'KG',
        piecesPerCarton: 1,
        isActive: true,
      });
      expect(res.body).not.toHaveProperty('defaultTaxRate');
      const stored = await t.prisma.product.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.organizationId).toBe(orgA.id);
    });

    it('creates a product with only the required fields', async () => {
      const res = await create(adminA, REQUIRED_ONLY).expect(201);
      expect(res.body).toMatchObject({
        name: 'Dalda Pouch 1x5',
        code: null,
        rateCode: null,
        weight: null,
        unit: null,
        piecesPerCarton: null,
      });
    });

    it('treats empty optional fields as not set and cleans the name', async () => {
      const res = await create(adminA, {
        ...REQUIRED_ONLY,
        name: '  Dalda   Ghee 1Kg ',
        code: '  ',
        rateCode: '',
        weight: '',
        unit: '',
        piecesPerCarton: '',
      }).expect(201);
      expect(res.body).toMatchObject({
        name: 'Dalda Ghee 1Kg',
        code: null,
        rateCode: null,
        weight: null,
        unit: null,
      });
    });

    it('ignores organizationId sent by the client', async () => {
      const res = await create(adminA, {
        ...REQUIRED_ONLY,
        name: 'Sneaky',
        organizationId: orgB.id,
      }).expect(201);
      expect(
        (await t.prisma.product.findUniqueOrThrow({ where: { id: res.body.id } })).organizationId,
      ).toBe(orgA.id);
    });
  });

  describe('validation', () => {
    it('requires name and the three prices', async () => {
      const res = await create(adminA, {}).expect(400);
      expect(paths(res)).toEqual(['costPrice', 'name', 'retailPrice', 'tradePrice']);
      const blank = await create(adminA, {
        name: '   ',
        retailPrice: '',
        tradePrice: ' ',
        costPrice: '',
      }).expect(400);
      expect(blank.body.details).toEqual(
        expect.arrayContaining([
          { path: 'name', message: 'Product name is required' },
          { path: 'retailPrice', message: 'Retail price is required' },
        ]),
      );
    });

    it.each([
      ['a negative price', { retailPrice: '-5' }, 'retailPrice'],
      ['more than 2 decimals', { tradePrice: '10.555' }, 'tradePrice'],
      ['a non-numeric price', { costPrice: 'abc' }, 'costPrice'],
      [
        'a price sent as a JSON number (money must be a string)',
        { costPrice: 2050.25 },
        'costPrice',
      ],
      ['a too-large price', { retailPrice: '1234567890123' }, 'retailPrice'],
      ['a name over 150 characters', { name: 'x'.repeat(151) }, 'name'],
      ['a code over 40 characters', { code: 'c'.repeat(41) }, 'code'],
      ['a zero weight', { weight: '0' }, 'weight'],
      ['a weight with 4 decimals', { weight: '1.2345' }, 'weight'],
      ['an unknown unit', { unit: 'TON' }, 'unit'],
      ['zero pieces per carton', { piecesPerCarton: 0 }, 'piecesPerCarton'],
      ['fractional pieces per carton', { piecesPerCarton: 1.5 }, 'piecesPerCarton'],
    ])('rejects %s', async (_label, patch, path) => {
      const res = await create(adminA, { ...REQUIRED_ONLY, name: 'Validation', ...patch }).expect(
        400,
      );
      expect(paths(res)).toEqual([path]);
    });

    it('gives readable messages for optional number fields', async () => {
      const res = await create(adminA, {
        ...REQUIRED_ONLY,
        name: 'Messages',
        piecesPerCarton: '1.5',
        weight: 'abc',
        unit: 'TON',
      }).expect(400);
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          { path: 'piecesPerCarton', message: 'Pieces per carton must be a whole number' },
          { path: 'weight', message: 'Weight must be a number like 4.5 (up to 3 decimals)' },
          { path: 'unit', message: 'Choose KG, Gram, Liter or ML' },
        ]),
      );
      expect(res.body.details).toHaveLength(3);
    });

    it('validates updates too', async () => {
      const id = (await list(adminA, '?q=4000000164')).body.items[0].id;
      const res = await update(adminA, id, {
        name: '',
        retailPrice: '1.999',
        isActive: 'no',
      }).expect(400);
      expect(paths(res)).toEqual(['isActive', 'name', 'retailPrice']);
    });
  });

  describe('decimal price handling', () => {
    it('stores prices as numeric columns, not floats', async () => {
      const columns = await t.prisma.$queryRaw<
        { column_name: string; data_type: string; numeric_scale: number }[]
      >`
        SELECT column_name, data_type, numeric_scale FROM information_schema.columns
        WHERE table_name = 'Product' AND column_name IN ('retailPrice','tradePrice','costPrice','weight')
        ORDER BY column_name`;
      expect(columns).toEqual([
        { column_name: 'costPrice', data_type: 'numeric', numeric_scale: 2 },
        { column_name: 'retailPrice', data_type: 'numeric', numeric_scale: 2 },
        { column_name: 'tradePrice', data_type: 'numeric', numeric_scale: 2 },
        { column_name: 'weight', data_type: 'numeric', numeric_scale: 3 },
      ]);
    });

    it('keeps exact values (0.10 + 0.20 is exactly 0.30, unlike JS floats)', async () => {
      const a = await create(adminB, {
        name: 'Dec A',
        retailPrice: '0.1',
        tradePrice: '0.10',
        costPrice: '0.1',
      }).expect(201);
      const b = await create(adminB, {
        name: 'Dec B',
        retailPrice: '0.2',
        tradePrice: '0.20',
        costPrice: '0.2',
      }).expect(201);
      expect(a.body.retailPrice).toBe('0.10');
      const [{ total }] = await t.prisma.$queryRaw<{ total: string }[]>`
        SELECT SUM("retailPrice")::text AS total FROM "Product" WHERE id IN (${a.body.id}::uuid, ${b.body.id}::uuid)`;
      expect(total).toBe('0.30');
      expect(0.1 + 0.2).not.toBe(0.3); // why money never uses JS numbers
    });

    it('round-trips large amounts without losing precision', async () => {
      const res = await create(adminB, {
        name: 'Big',
        retailPrice: '999999999999.99',
        tradePrice: '123456789012.34',
        costPrice: '0',
      }).expect(201);
      expect(res.body).toMatchObject({
        retailPrice: '999999999999.99',
        tradePrice: '123456789012.34',
        costPrice: '0.00',
      });
    });
  });

  describe('duplicate product codes', () => {
    it('rejects a code already used in the same organization (case-insensitive)', async () => {
      await create(adminA, { ...REQUIRED_ONLY, name: 'Coded', code: 'ABC-1' }).expect(201);
      const res = await create(adminA, {
        ...REQUIRED_ONLY,
        name: 'Coded 2',
        code: ' abc-1 ',
      }).expect(409);
      expect(res.body.message).toBe('A product with this code already exists');
    });

    it('allows the same code in another organization', async () => {
      const res = await create(adminB, { ...DALDA_TIN }).expect(201);
      expect(res.body.code).toBe('4000000164');
    });

    it('allows many products without a code', async () => {
      await create(adminA, { ...REQUIRED_ONLY, name: 'No Code 1' }).expect(201);
      await create(adminA, { ...REQUIRED_ONLY, name: 'No Code 2' }).expect(201);
    });

    it('rejects changing a code to one already in use', async () => {
      const other = await create(adminA, { ...REQUIRED_ONLY, name: 'Other', code: 'XYZ-9' }).expect(
        201,
      );
      await update(adminA, other.body.id, { code: '4000000164' }).expect(409);
      expect(
        (await t.prisma.product.findUniqueOrThrow({ where: { id: other.body.id } })).code,
      ).toBe('XYZ-9');
    });
  });

  describe('edit / deactivate / reactivate', () => {
    let id: string;

    beforeAll(async () => {
      id = (await create(adminA, { ...DALDA_TIN, name: 'Editable', code: 'EDIT-1' }).expect(201))
        .body.id;
    });

    it('edits prices and fields', async () => {
      const res = await update(adminA, id, {
        name: 'Edited Tin',
        retailPrice: '2200',
        costPrice: '2060.5',
        weight: '4.25',
        unit: 'LITER',
        piecesPerCarton: 6,
      }).expect(200);
      expect(res.body).toMatchObject({
        name: 'Edited Tin',
        retailPrice: '2200.00',
        tradePrice: '2102.50',
        costPrice: '2060.50',
        weight: '4.25',
        unit: 'LITER',
        piecesPerCarton: 6,
      });
    });

    it('clears optional fields with empty strings or null', async () => {
      const res = await update(adminA, id, {
        code: '',
        rateCode: null,
        weight: '',
        unit: null,
        piecesPerCarton: '',
      }).expect(200);
      expect(res.body).toMatchObject({
        code: null,
        rateCode: null,
        weight: null,
        unit: null,
        piecesPerCarton: null,
      });
    });

    it('deactivates and reactivates', async () => {
      expect((await update(adminA, id, { isActive: false }).expect(200)).body.isActive).toBe(false);
      expect((await update(adminA, id, { isActive: true }).expect(200)).body.isActive).toBe(true);
    });

    it('returns 404 for an unknown id and 400 for a malformed id', async () => {
      await update(adminA, '0199a000-0000-7000-8000-000000000000', { name: 'X' }).expect(404);
      await http().get('/api/products/not-a-uuid').set(auth(adminA)).expect(400);
    });
  });

  describe('search / filter / pagination', () => {
    it('lists products sorted by name', async () => {
      const res = await list(adminA, '?pageSize=100').expect(200);
      const names = res.body.items.map((p: { name: string }) => p.name);
      expect(names).toEqual(
        [...names].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)),
      );
      expect(res.body).toMatchObject({ page: 1, pageSize: 100, total: names.length });
    });

    it('searches by name (case-insensitive) and by code', async () => {
      const byName = await list(adminA, '?q=GHEE').expect(200);
      expect(byName.body.items.map((p: { name: string }) => p.name)).toEqual(['Dalda Ghee 1Kg']);
      const byCode = await list(adminA, '?q=00001').expect(200);
      expect(byCode.body.items.map((p: { code: string }) => p.code)).toEqual(['4000000164']);
      const byCodeCase = await list(adminA, '?q=abc').expect(200);
      expect(byCodeCase.body.items.map((p: { code: string }) => p.code)).toEqual(['ABC-1']);
    });

    it('filters by status', async () => {
      const sneaky = (await list(adminA, '?q=sneaky')).body.items[0];
      await update(adminA, sneaky.id, { isActive: false }).expect(200);
      const inactive = await list(adminA, '?status=inactive').expect(200);
      expect(inactive.body.items.map((p: { name: string }) => p.name)).toEqual(['Sneaky']);
      const active = await list(adminA, '?status=active&pageSize=100').expect(200);
      expect(active.body.items.every((p: { isActive: boolean }) => p.isActive)).toBe(true);
    });

    it('paginates', async () => {
      const all = await list(adminA, '?pageSize=100').expect(200);
      const page2 = await list(adminA, '?pageSize=3&page=2').expect(200);
      expect(page2.body.items).toEqual(all.body.items.slice(3, 6));
      expect(page2.body.total).toBe(all.body.total);
    });

    it('rejects invalid query parameters', async () => {
      await list(adminA, '?status=archived').expect(400);
      await list(adminA, '?page=0').expect(400);
    });
  });

  describe('permissions', () => {
    it('Order Booker cannot use any product management endpoint', async () => {
      const productId = (await list(adminA)).body.items[0].id;
      await list(bookerA).expect(403);
      await http().get(`/api/products/${productId}`).set(auth(bookerA)).expect(403);
      await create(bookerA, REQUIRED_ONLY).expect(403);
      await update(bookerA, productId, { retailPrice: '1' }).expect(403);
    });

    it('Super Admin cannot use organization product endpoints', async () => {
      await list(superAdmin).expect(403);
      await create(superAdmin, REQUIRED_ONLY).expect(403);
    });

    it('requires authentication', async () => {
      await http().get('/api/products').expect(401);
      await http().post('/api/products').send(REQUIRED_ONLY).expect(401);
    });
  });

  describe('tenant isolation', () => {
    it('lists only the caller organization products', async () => {
      const resB = await list(adminB, '?pageSize=100').expect(200);
      const orgBIds = (await t.prisma.product.findMany({ where: { organizationId: orgB.id } }))
        .map((p) => p.id)
        .sort();
      expect(resB.body.items.map((p: { id: string }) => p.id).sort()).toEqual(orgBIds);
    });

    it('Org A cannot read, edit or deactivate an Org B product (404) and B is unchanged', async () => {
      const productB = await t.prisma.product.findFirstOrThrow({
        where: { organizationId: orgB.id, code: '4000000164' },
      });
      await http().get(`/api/products/${productB.id}`).set(auth(adminA)).expect(404);
      await update(adminA, productB.id, { retailPrice: '1', isActive: false }).expect(404);

      const after = await t.prisma.product.findUniqueOrThrow({ where: { id: productB.id } });
      expect(after.retailPrice.toFixed(2)).toBe('2180.00');
      expect(after.isActive).toBe(true);
    });
  });
});
