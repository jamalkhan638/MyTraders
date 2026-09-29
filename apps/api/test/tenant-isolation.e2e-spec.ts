import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { TenantContext } from '../src/common/tenant/tenant-context';
import { type AuthContext } from '../src/common/types/auth-context';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { UnsafeTenantQueryError } from '../src/prisma/tenant-scope';
import { login } from './utils/auth';
import { createOrganization, createUser } from './utils/factories';
import { createTestApp, resetDatabase, type TestApp } from './utils/test-app';

describe('Tenant isolation (e2e)', () => {
  let t: TestApp;
  let orgA: { id: string };
  let orgB: { id: string };
  let adminA: { id: string; email: string };
  let bookerA: { id: string };
  let adminB: { id: string; email: string };
  let bookerB: { id: string };
  let tokenA: string;
  let tokenB: string;

  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    orgA = await createOrganization(t.prisma, { name: 'Org A' });
    orgB = await createOrganization(t.prisma, { name: 'Org B' });
    adminA = await createUser(t.prisma, { organizationId: orgA.id, role: 'ADMIN' });
    bookerA = await createUser(t.prisma, { organizationId: orgA.id, role: 'ORDER_BOOKER' });
    adminB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ADMIN' });
    bookerB = await createUser(t.prisma, { organizationId: orgB.id, role: 'ORDER_BOOKER' });
    tokenA = (await login(t.app, adminA.email)).accessToken;
    tokenB = (await login(t.app, adminB.email)).accessToken;
  });

  afterAll(() => t.close());

  describe('through the API', () => {
    it('lists only the users of the caller organization', async () => {
      const resA = await http()
        .get('/api/users')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const resB = await http()
        .get('/api/users')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      const ids = (res: request.Response) => res.body.map((u: { id: string }) => u.id).sort();

      expect(ids(resA)).toEqual([adminA.id, bookerA.id].sort());
      expect(ids(resB)).toEqual([adminB.id, bookerB.id].sort());
    });

    it('returns 404 when Org A requests an Org B record by id', async () => {
      await http()
        .get(`/api/users/${bookerB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
      await http()
        .get(`/api/users/${bookerA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('returns the record for its own organization', async () => {
      const res = await http()
        .get(`/api/users/${bookerA.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body).toMatchObject({ id: bookerA.id, role: 'ORDER_BOOKER' });
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('rejects malformed ids with 400', async () => {
      await http()
        .get('/api/users/not-a-uuid')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
    });

    it('ignores an organizationId smuggled in the query string', async () => {
      const res = await http()
        .get(`/api/users?organizationId=${orgB.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.every((u: { id: string }) => [adminA.id, bookerA.id].includes(u.id))).toBe(
        true,
      );
    });
  });

  describe('tenant-scoped Prisma client', () => {
    let cls: ClsService;
    let tenant: TenantContext;
    let db: TenantPrismaService;

    const as = <T>(auth: AuthContext | undefined, fn: () => Promise<T>): Promise<T> =>
      cls.run(async () => {
        if (auth) tenant.set(auth);
        return fn();
      });
    const asOrgA = <T>(fn: () => Promise<T>) =>
      as({ userId: adminA.id, organizationId: orgA.id, role: 'ADMIN' }, fn);

    beforeAll(() => {
      cls = t.app.get(ClsService);
      tenant = t.app.get(TenantContext);
      db = t.app.get(TenantPrismaService);
    });

    it('scopes reads to the current organization', async () => {
      const users = await asOrgA(() => db.client.user.findMany());
      expect(users.map((u) => u.organizationId)).toEqual([orgA.id, orgA.id]);
      expect(
        await asOrgA(() => db.client.user.findFirst({ where: { id: bookerB.id } })),
      ).toBeNull();
      expect(await asOrgA(() => db.client.user.count({ where: { id: bookerB.id } }))).toBe(0);
    });

    it('cannot update or delete another organization rows', async () => {
      const updated = await asOrgA(() =>
        db.client.user.updateMany({ where: { id: bookerB.id }, data: { name: 'hacked' } }),
      );
      expect(updated.count).toBe(0);
      const deleted = await asOrgA(() => db.client.user.deleteMany({ where: { id: bookerB.id } }));
      expect(deleted.count).toBe(0);
      expect((await t.prisma.user.findUniqueOrThrow({ where: { id: bookerB.id } })).name).not.toBe(
        'hacked',
      );
    });

    it('sets organizationId on create and refuses a different one', async () => {
      const created = await asOrgA(() =>
        db.client.user.create({
          data: {
            email: 'created@a.test',
            name: 'Created',
            role: 'ORDER_BOOKER',
            passwordHash: 'x',
          },
        }),
      );
      expect(created.organizationId).toBe(orgA.id);

      await expect(
        asOrgA(() =>
          db.client.user.create({
            data: {
              organizationId: orgB.id,
              email: 'evil@a.test',
              name: 'Evil',
              role: 'ADMIN',
              passwordHash: 'x',
            },
          }),
        ),
      ).rejects.toBeInstanceOf(UnsafeTenantQueryError);
      await t.prisma.user.delete({ where: { id: created.id } });
    });

    it('forbids operations that cannot be scoped (findUnique, update, delete, upsert)', async () => {
      await expect(
        asOrgA(() => db.client.user.findUnique({ where: { id: bookerB.id } })),
      ).rejects.toBeInstanceOf(UnsafeTenantQueryError);
      await expect(
        asOrgA(() => db.client.user.update({ where: { id: bookerB.id }, data: { name: 'x' } })),
      ).rejects.toBeInstanceOf(UnsafeTenantQueryError);
      await expect(
        asOrgA(() => db.client.user.delete({ where: { id: bookerB.id } })),
      ).rejects.toBeInstanceOf(UnsafeTenantQueryError);
    });

    it('exposes only the current organization row', async () => {
      const orgs = await asOrgA(() => db.client.organization.findMany());
      expect(orgs.map((o) => o.id)).toEqual([orgA.id]);
      expect(
        await asOrgA(() => db.client.organization.findFirst({ where: { id: orgB.id } })),
      ).toBeNull();
    });

    it('blocks models that are not tenant-scoped', async () => {
      await expect(asOrgA(() => db.client.refreshToken.findMany())).rejects.toBeInstanceOf(
        UnsafeTenantQueryError,
      );
    });

    it('refuses to run without an authenticated organization', async () => {
      await expect(as(undefined, () => db.client.user.findMany())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(
        as({ userId: 'x', organizationId: null, role: 'SUPER_ADMIN' }, () =>
          db.client.user.findMany(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
