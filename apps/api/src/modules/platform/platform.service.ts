import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  type CreateTenant,
  type ListTenantsQuery,
  type Paginated,
  type PlatformSummary,
  type TenantDetails,
  type TenantSummary,
} from '@mytraders/shared-types';
import { type Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { createOrganizationWithAdmin } from './create-organization';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

const ADMIN_FIELDS = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  organizationId: true,
} as const satisfies Prisma.UserSelect;

type AdminRow = Prisma.UserGetPayload<{ select: typeof ADMIN_FIELDS }>;

/**
 * Platform tenant management (Super Admin, D-38). This is the one module that works ACROSS
 * organizations, so it uses the unscoped Prisma client — and in exchange it only ever reads
 * tenant identity, status, Admin accounts and usage COUNTS. It never returns a shop, order,
 * invoice, ledger entry, payment, expense or any amount, and it never writes tenant business data.
 *
 * Status changes take effect on the next request of every user of the tenant: the auth guard
 * re-reads the organization status on each request, and suspension also revokes every refresh
 * token of the tenant's users in the same transaction.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger('Platform');

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tenant: TenantContext,
  ) {}

  async summary(): Promise<PlatformSummary> {
    const groups = await this.prisma.organization.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const of = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
    return {
      totalTenants: groups.reduce((sum, g) => sum + g._count._all, 0),
      activeTenants: of('ACTIVE'),
      suspendedTenants: of('SUSPENDED'),
      trialTenants: of('TRIAL'),
    };
  }

  async list(query: ListTenantsQuery): Promise<Paginated<TenantSummary>> {
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        select: { id: true, name: true, status: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.organization.count({ where }),
    ]);
    const usage = await this.usage(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        ...usage(r.id),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<TenantDetails> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        town: true,
        phone: true,
        currency: true,
        timezone: true,
        invoicePrefix: true,
        createdAt: true,
        updatedAt: true,
        statusChangedAt: true,
        statusChangedBy: { select: { id: true, name: true } },
        suspensionReason: true,
      },
    });
    if (!org) throw new NotFoundException('Tenant not found');
    const [usage, admins, roles, activeUsers] = await Promise.all([
      this.usage([id]),
      this.prisma.user.findMany({
        where: { organizationId: id, role: 'ADMIN' },
        select: ADMIN_FIELDS,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: { organizationId: id },
        _count: { _all: true },
      }),
      this.prisma.user.count({ where: { organizationId: id, isActive: true } }),
    ]);
    const { counts, ...summary } = usage(id);
    const role = (r: string) => roles.find((g) => g.role === r)?._count._all ?? 0;
    return {
      ...org,
      ...summary,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
      statusChangedAt: iso(org.statusChangedAt),
      admins: admins.map(toAdmin),
      counts: {
        ...counts,
        admins: role('ADMIN'),
        orderBookers: role('ORDER_BOOKER'),
        activeUsers,
      },
    };
  }

  /** Creates the tenant (ACTIVE) with its first Admin, counters and default expense categories. */
  async create(input: CreateTenant): Promise<TenantDetails> {
    const taken = await this.prisma.user.findUnique({
      where: { email: input.admin.email },
      select: { id: true },
    });
    if (taken) {
      const message = 'This email is already used by another account';
      throw new ConflictException({ message, details: [{ path: 'admin.email', message }] });
    }
    const { organization } = await createOrganizationWithAdmin(this.prisma, {
      name: input.name,
      status: 'ACTIVE',
      currency: input.currency,
      timezone: input.timezone,
      invoicePrefix: input.invoicePrefix,
      invoiceNumberDigits: input.invoiceNumberDigits,
      admin: input.admin,
    });
    this.logger.log(`tenant ${organization.id} created by ${this.tenant.require().userId}`);
    return this.get(organization.id);
  }

  /** TRIAL / SUSPENDED → ACTIVE. Users sign in again (their sessions ended on suspension). */
  async activate(id: string): Promise<TenantDetails> {
    const { userId } = this.tenant.require();
    const changed = await this.prisma.organization.updateMany({
      where: { id, status: { not: 'ACTIVE' } },
      data: {
        status: 'ACTIVE',
        statusChangedAt: new Date(),
        statusChangedById: userId,
        suspensionReason: null,
      },
    });
    if (changed.count === 0) await this.conflictOrMissing(id, 'This tenant is already active');
    this.logger.log(`tenant ${id} activated by ${userId}`);
    return this.get(id);
  }

  /**
   * → SUSPENDED, in one transaction with revoking every refresh token of the tenant's users.
   * Access tokens stop working on the next request (the guard re-reads the status). Tenant data
   * is not touched.
   */
  async suspend(id: string, reason: string): Promise<TenantDetails> {
    const { userId } = this.tenant.require();
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.organization.updateMany({
        where: { id, status: { not: 'SUSPENDED' } },
        data: {
          status: 'SUSPENDED',
          statusChangedAt: new Date(),
          statusChangedById: userId,
          suspensionReason: reason,
        },
      });
      if (changed.count === 0) await this.conflictOrMissing(id, 'This tenant is already suspended');
      await tx.refreshToken.updateMany({
        where: { revokedAt: null, user: { organizationId: id } },
        data: { revokedAt: new Date() },
      });
    });
    this.logger.log(`tenant ${id} suspended by ${userId}`);
    return this.get(id);
  }

  /**
   * Sets a new password for one of the tenant's Admins (same model as an Admin resetting an
   * Order Booker's password): the Super Admin chooses it and gives it to the owner; the Admin's
   * existing sessions end. Only ADMIN accounts of that tenant can be reset here.
   */
  async resetAdminPassword(id: string, adminId: string, password: string): Promise<void> {
    const admin = await this.prisma.user.findFirst({
      where: { id: adminId, organizationId: id, role: 'ADMIN' },
      select: { id: true },
    });
    if (!admin) throw new NotFoundException('Tenant Admin not found');
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: admin.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: admin.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    this.logger.log(
      `tenant ${id} admin ${admin.id} password reset by ${this.tenant.require().userId}`,
    );
  }

  /** Users / shops / products / invoices counts, primary Admin and last sign-in per tenant. */
  private async usage(ids: string[]) {
    const where = { organizationId: { in: ids } };
    const [users, shops, products, invoices, logins, admins] = await Promise.all([
      this.prisma.user.groupBy({ by: ['organizationId'], where, _count: { _all: true } }),
      this.prisma.shop.groupBy({ by: ['organizationId'], where, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['organizationId'], where, _count: { _all: true } }),
      this.prisma.invoice.groupBy({ by: ['organizationId'], where, _count: { _all: true } }),
      this.prisma.user.groupBy({ by: ['organizationId'], where, _max: { lastLoginAt: true } }),
      this.prisma.user.findMany({
        where: { ...where, role: 'ADMIN' },
        select: ADMIN_FIELDS,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const count = (
      groups: { organizationId: string | null; _count: { _all: number } }[],
      id: string,
    ) => groups.find((g) => g.organizationId === id)?._count._all ?? 0;
    return (id: string) => {
      const primary = admins.find((a) => a.organizationId === id);
      return {
        primaryAdmin: primary ? { id: primary.id, name: primary.name, email: primary.email } : null,
        counts: {
          users: count(users, id),
          shops: count(shops, id),
          products: count(products, id),
          invoices: count(invoices, id),
        },
        lastLoginAt: iso(logins.find((g) => g.organizationId === id)?._max.lastLoginAt),
      };
    };
  }

  private async conflictOrMissing(id: string, message: string): Promise<never> {
    const exists = await this.prisma.organization.count({ where: { id } });
    if (!exists) throw new NotFoundException('Tenant not found');
    throw new ConflictException(message);
  }
}

function toAdmin(row: AdminRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
    lastLoginAt: iso(row.lastLoginAt),
    createdAt: row.createdAt.toISOString(),
  };
}
