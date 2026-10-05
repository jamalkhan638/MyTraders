import request from 'supertest';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

const DALDA_TIN = {
  name: 'mbp 4.5Kg TIN',
  code: '4000000164',
  type: 'TIN',
  retailPrice: '2180',
  tradePrice: '2102.50',
  invoiceCostPrice: '2050.25',
  defaultTaxRate: '18',
  weight: '4.5',
  weightUnit: 'KG',
  weightBasis: 'PIECE',
  piecesPerCarton: 6,
};
const DALDA_POUCH = {
  name: 'mbp POUCH 1*5',
  code: '220000',
  type: 'POUCH',
  retailPrice: '1135',
  tradePrice: '1100',
  invoiceCostPrice: '1050',
  defaultTaxRate: '18',
  weight: '4.5',
  weightUnit: 'KG',
  weightBasis: 'CARTON',
  piecesPerCarton: 5,
};
const REQUIRED_ONLY = {
  name: 'Dalda Ghee 1Kg',
  type: 'TIN',
  retailPrice: '520',
  tradePrice: '500',
  invoiceCostPrice: '480',
  defaultTaxRate: '18',
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
  const idOf = async (code: string) =>
    (await list(adminA, `?q=${code}`)).body.items[0].id as string;

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
    it('creates a TIN with all fields', async () => {
      const res = await create(adminA, DALDA_TIN).expect(201);
      expect(res.body).toMatchObject({
        name: 'mbp 4.5Kg TIN',
        code: '4000000164',
        type: 'TIN',
        retailPrice: '2180.00',
        tradePrice: '2102.50',
        invoiceCostPrice: '2050.25',
        defaultTaxRate: '18',
        weight: '4.5',
        weightUnit: 'KG',
        weightBasis: 'PIECE',
        piecesPerCarton: 6,
        isActive: true,
      });
      expect(res.body).not.toHaveProperty('costPrice');
      const stored = await t.prisma.product.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.organizationId).toBe(orgA.id);
    });

    it('creates a POUCH with pieces per carton and a per-carton weight', async () => {
      const res = await create(adminA, DALDA_POUCH).expect(201);
      expect(res.body).toMatchObject({
        type: 'POUCH',
        piecesPerCarton: 5,
        weightBasis: 'CARTON',
        tradePrice: '1100.00',
      });
    });

    it('creates a product with only the required fields', async () => {
      const res = await create(adminA, REQUIRED_ONLY).expect(201);
      expect(res.body).toMatchObject({
        name: 'Dalda Ghee 1Kg',
        type: 'TIN',
        code: null,
        weight: null,
        weightUnit: null,
        weightBasis: null,
        piecesPerCarton: null,
        defaultTaxRate: '18',
      });
    });

    it('treats empty optional fields as not set and cleans the name', async () => {
      const res = await create(adminA, {
        ...REQUIRED_ONLY,
        name: '  Dalda   Ghee 500g ',
        code: '  ',
        weight: '',
        weightUnit: '',
        weightBasis: '',
        piecesPerCarton: '',
      }).expect(201);
      expect(res.body).toMatchObject({
        name: 'Dalda Ghee 500g',
        code: null,
        weight: null,
        weightUnit: null,
        weightBasis: null,
      });
    });

    it('stores the tax rate the Admin enters (nothing hard-coded)', async () => {
      const res = await create(adminA, {
        ...REQUIRED_ONLY,
        name: 'Low tax item',
        defaultTaxRate: '17.5',
      }).expect(201);
      expect(res.body.defaultTaxRate).toBe('17.5');
      const zero = await create(adminA, {
        ...REQUIRED_ONLY,
        name: 'Exempt item',
        defaultTaxRate: '0',
      }).expect(201);
      expect(zero.body.defaultTaxRate).toBe('0');
    });

    it('ignores organizationId sent by the client', async () => {
      const res = await create(adminA, {
        ...REQUIRED_ONLY,
        name: 'Sneaky',
        organizationId: orgB.id,
      }).expect(201);
      const stored = await t.prisma.product.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.organizationId).toBe(orgA.id);
    });
  });

  describe('validation', () => {
    it('requires name, type, the three prices and the default tax rate', async () => {
      const res = await create(adminA, {}).expect(400);
      expect(paths(res)).toEqual([
        'defaultTaxRate',
        'invoiceCostPrice',
        'name',
        'retailPrice',
        'tradePrice',
        'type',
      ]);
    });

    it.each([
      ['an unknown type', { type: 'CAN' }, 'type', 'Choose TIN or POUCH'],
      ['a negative price', { retailPrice: '-5' }, 'retailPrice', undefined],
      ['more than 2 decimals', { tradePrice: '10.555' }, 'tradePrice', undefined],
      ['a non-numeric cost', { invoiceCostPrice: 'abc' }, 'invoiceCostPrice', undefined],
      [
        'a price sent as a JSON number',
        { invoiceCostPrice: 2050.25 },
        'invoiceCostPrice',
        undefined,
      ],
      ['a too-large price', { retailPrice: '1234567890123' }, 'retailPrice', undefined],
      [
        'a tax rate above 100',
        { defaultTaxRate: '101' },
        'defaultTaxRate',
        'Default tax rate must be 100 or less',
      ],
      ['a tax rate with 3 decimals', { defaultTaxRate: '17.555' }, 'defaultTaxRate', undefined],
      ['a negative tax rate', { defaultTaxRate: '-1' }, 'defaultTaxRate', undefined],
      ['a tax rate sent as a number', { defaultTaxRate: 18 }, 'defaultTaxRate', undefined],
      ['a name over 150 characters', { name: 'x'.repeat(151) }, 'name', undefined],
      ['a code over 40 characters', { code: 'c'.repeat(41) }, 'code', undefined],
      [
        'a zero weight',
        { weight: '0', weightUnit: 'KG', weightBasis: 'PIECE' },
        'weight',
        undefined,
      ],
      [
        'an unknown weight unit',
        { weight: '1', weightUnit: 'TON', weightBasis: 'PIECE' },
        'weightUnit',
        undefined,
      ],
      [
        'an unknown weight basis',
        { weight: '1', weightUnit: 'KG', weightBasis: 'BOX' },
        'weightBasis',
        undefined,
      ],
      ['fractional pieces per carton', { piecesPerCarton: 1.5 }, 'piecesPerCarton', undefined],
    ])('rejects %s', async (_label, patch, path, message) => {
      const res = await create(adminA, { ...REQUIRED_ONLY, name: 'Validation', ...patch }).expect(
        400,
      );
      expect(paths(res)).toEqual([path]);
      if (message) expect(res.body.details[0].message).toBe(message);
    });

    it('requires pieces per carton for a POUCH', async () => {
      const res = await create(adminA, {
        ...DALDA_POUCH,
        code: 'P-NO-PPC',
        piecesPerCarton: '',
      }).expect(400);
      expect(res.body.details).toEqual([
        { path: 'piecesPerCarton', message: 'Pieces per carton is required for a POUCH' },
      ]);
    });

    it('requires weight unit and basis when a weight is given', async () => {
      const res = await create(adminA, {
        ...REQUIRED_ONLY,
        name: 'Weight only',
        weight: '4.5',
      }).expect(400);
      expect(res.body.details).toEqual([
        { path: 'weightUnit', message: 'Choose the weight unit' },
        { path: 'weightBasis', message: 'Choose whether the weight is per piece or per carton' },
      ]);
    });

    it('checks the same rules on edit against the stored product', async () => {
      const tinId = await idOf('4000000164');
      // A TIN cannot become a POUCH without pieces per carton…
      await update(adminA, tinId, { piecesPerCarton: null }).expect(200);
      const res = await update(adminA, tinId, { type: 'POUCH' }).expect(400);
      expect(res.body.details).toEqual([
        { path: 'piecesPerCarton', message: 'Pieces per carton is required for a POUCH' },
      ]);
      // …but it can when the value comes in the same request.
      const ok = await update(adminA, tinId, { type: 'POUCH', piecesPerCarton: 6 }).expect(200);
      expect(ok.body).toMatchObject({ type: 'POUCH', piecesPerCarton: 6 });
      await update(adminA, tinId, { type: 'TIN' }).expect(200);

      // Removing the unit of a product that has a weight is refused.
      const unit = await update(adminA, tinId, { weightUnit: null }).expect(400);
      expect(paths(unit)).toEqual(['weightUnit']);
      // Removing the weight together with unit and basis is fine.
      await update(adminA, tinId, { weight: '', weightUnit: '', weightBasis: '' }).expect(200);
      await update(adminA, tinId, { weight: '4.5', weightUnit: 'KG', weightBasis: 'PIECE' }).expect(
        200,
      );
    });

    it('a POUCH cannot drop its pieces per carton on edit', async () => {
      const pouchId = await idOf('220000');
      const res = await update(adminA, pouchId, { piecesPerCarton: '' }).expect(400);
      expect(paths(res)).toEqual(['piecesPerCarton']);
    });

    it('validates field formats on edit too', async () => {
      const tinId = await idOf('4000000164');
      const res = await update(adminA, tinId, {
        name: '',
        retailPrice: '1.999',
        defaultTaxRate: '150',
        isActive: 'no',
      }).expect(400);
      expect(paths(res)).toEqual(['defaultTaxRate', 'isActive', 'name', 'retailPrice']);
    });
  });

  describe('decimal price handling', () => {
    it('stores prices, tax rate and weight as numeric columns, not floats', async () => {
      const columns = await t.prisma.$queryRaw<
        { column_name: string; data_type: string; numeric_scale: number }[]
      >`
        SELECT column_name, data_type, numeric_scale FROM information_schema.columns
        WHERE table_name = 'Product'
          AND column_name IN ('retailPrice','tradePrice','invoiceCostPrice','defaultTaxRate','weight')
        ORDER BY column_name`;
      expect(columns).toEqual([
        { column_name: 'defaultTaxRate', data_type: 'numeric', numeric_scale: 4 },
        { column_name: 'invoiceCostPrice', data_type: 'numeric', numeric_scale: 2 },
        { column_name: 'retailPrice', data_type: 'numeric', numeric_scale: 2 },
        { column_name: 'tradePrice', data_type: 'numeric', numeric_scale: 2 },
        { column_name: 'weight', data_type: 'numeric', numeric_scale: 3 },
      ]);
    });

    it('keeps exact values (0.10 + 0.20 is exactly 0.30, unlike JS floats)', async () => {
      const a = await create(adminB, { ...REQUIRED_ONLY, name: 'Dec A', tradePrice: '0.1' }).expect(
        201,
      );
      const b = await create(adminB, {
        ...REQUIRED_ONLY,
        name: 'Dec B',
        tradePrice: '0.20',
      }).expect(201);
      expect(a.body.tradePrice).toBe('0.10');
      const [{ total }] = await t.prisma.$queryRaw<{ total: string }[]>`
        SELECT SUM("tradePrice")::text AS total FROM "Product"
        WHERE id IN (${a.body.id}::uuid, ${b.body.id}::uuid)`;
      expect(total).toBe('0.30');
      expect(0.1 + 0.2).not.toBe(0.3); // why money never uses JS numbers
    });

    it('round-trips large amounts without losing precision', async () => {
      const res = await create(adminB, {
        ...REQUIRED_ONLY,
        name: 'Big',
        retailPrice: '999999999999.99',
        tradePrice: '123456789012.34',
        invoiceCostPrice: '0',
      }).expect(201);
      expect(res.body).toMatchObject({
        retailPrice: '999999999999.99',
        tradePrice: '123456789012.34',
        invoiceCostPrice: '0.00',
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

    it('edits prices, tax rate, type and weight fields', async () => {
      const res = await update(adminA, id, {
        name: 'Edited Tin',
        retailPrice: '2200',
        invoiceCostPrice: '2060.5',
        defaultTaxRate: '17',
        weight: '4.25',
        weightUnit: 'LITER',
        weightBasis: 'CARTON',
        type: 'POUCH',
        piecesPerCarton: 6,
      }).expect(200);
      expect(res.body).toMatchObject({
        name: 'Edited Tin',
        type: 'POUCH',
        retailPrice: '2200.00',
        tradePrice: '2102.50',
        invoiceCostPrice: '2060.50',
        defaultTaxRate: '17',
        weight: '4.25',
        weightUnit: 'LITER',
        weightBasis: 'CARTON',
        piecesPerCarton: 6,
      });
    });

    it('clears optional fields with empty strings or null (when the rules allow it)', async () => {
      await update(adminA, id, { type: 'TIN' }).expect(200);
      const res = await update(adminA, id, {
        code: '',
        weight: '',
        weightUnit: null,
        weightBasis: '',
        piecesPerCarton: '',
      }).expect(200);
      expect(res.body).toMatchObject({
        code: null,
        weight: null,
        weightUnit: null,
        weightBasis: null,
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
      const byName = await list(adminA, '?q=GHEE 500').expect(200);
      expect(byName.body.items.map((p: { name: string }) => p.name)).toEqual(['Dalda Ghee 500g']);
      const byCode = await list(adminA, '?q=00001').expect(200);
      expect(byCode.body.items.map((p: { code: string }) => p.code)).toEqual(['4000000164']);
    });

    it('filters by type and by status', async () => {
      const pouches = await list(adminA, '?type=POUCH&pageSize=100').expect(200);
      expect(pouches.body.items.map((p: { name: string }) => p.name)).toEqual(['mbp POUCH 1*5']);
      const tins = await list(adminA, '?type=TIN&pageSize=100').expect(200);
      expect(tins.body.items.every((p: { type: string }) => p.type === 'TIN')).toBe(true);

      const sneaky = (await list(adminA, '?q=sneaky')).body.items[0];
      await update(adminA, sneaky.id, { isActive: false }).expect(200);
      const inactive = await list(adminA, '?status=inactive').expect(200);
      expect(inactive.body.items.map((p: { name: string }) => p.name)).toEqual(['Sneaky']);
    });

    it('paginates', async () => {
      const all = await list(adminA, '?pageSize=100').expect(200);
      const page2 = await list(adminA, '?pageSize=3&page=2').expect(200);
      expect(page2.body.items).toEqual(all.body.items.slice(3, 6));
      expect(page2.body.total).toBe(all.body.total);
    });

    it('rejects invalid query parameters', async () => {
      await list(adminA, '?status=archived').expect(400);
      await list(adminA, '?type=CAN').expect(400);
      await list(adminA, '?page=0').expect(400);
    });
  });

  describe('permissions', () => {
    it('Order Booker cannot use any product management endpoint', async () => {
      const productId = (await list(adminA)).body.items[0].id;
      await list(bookerA).expect(403);
      await http().get(`/api/products/${productId}`).set(auth(bookerA)).expect(403);
      await create(bookerA, REQUIRED_ONLY).expect(403);
      await update(bookerA, productId, { tradePrice: '1' }).expect(403);
    });

    it('Order Booker product list never contains prices or tax', async () => {
      const res = await http().get('/api/booker/products').set(auth(bookerA)).expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(Object.keys(res.body.items[0]).sort()).toEqual([
        'code',
        'id',
        'name',
        'piecesPerCarton',
        'type',
        'weight',
        'weightBasis',
        'weightUnit',
      ]);
      const keys = res.body.items.flatMap((item: object) => Object.keys(item));
      expect(keys.filter((k: string) => /price|cost|tax/i.test(k))).toEqual([]);
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
      await update(adminA, productB.id, { tradePrice: '1', isActive: false }).expect(404);

      const after = await t.prisma.product.findUniqueOrThrow({ where: { id: productB.id } });
      expect(after.tradePrice.toFixed(2)).toBe('2102.50');
      expect(after.isActive).toBe(true);
    });
  });

  describe('database rules', () => {
    it('the database itself refuses a POUCH without pieces per carton and a tax rate above 100', async () => {
      const base = {
        organizationId: orgA.id,
        name: 'DB rule',
        retailPrice: '1',
        tradePrice: '1',
        invoiceCostPrice: '1',
      };
      await expect(
        t.prisma.product.create({ data: { ...base, type: 'POUCH', defaultTaxRate: '18' } }),
      ).rejects.toThrow();
      await expect(
        t.prisma.product.create({ data: { ...base, type: 'TIN', defaultTaxRate: '101' } }),
      ).rejects.toThrow();
    });
  });
});
