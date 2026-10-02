import { type Prisma, type PrismaClient } from '@prisma/client';

/**
 * Models that carry an `organizationId` column. Every query on them is scoped to the
 * current organization. Add each new tenant-owned model here (docs/architecture.md §5).
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set<Prisma.ModelName>([
  'User',
  'OrganizationCounter',
  'Area',
  'ShopCategory',
  'Product',
  'Shop',
  'Order',
]);

/** The Organization row itself: readable/updatable only for the current organization. */
const ORGANIZATION_MODEL: Prisma.ModelName = 'Organization';

const SCOPED_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

/** Thrown when code tries a query that cannot be tenant-scoped safely. A programming error. */
export class UnsafeTenantQueryError extends Error {
  constructor(model: string, operation: string, reason: string) {
    super(`Unsafe tenant query ${model}.${operation}: ${reason}`);
    this.name = 'UnsafeTenantQueryError';
  }
}

function scopeWhere(args: { where?: object }, filter: object): void {
  args.where = args.where ? { AND: [args.where, filter] } : filter;
}

function withOrganization(model: string, operation: string, data: unknown, organizationId: string) {
  if (!data || typeof data !== 'object') return data;
  const record = data as Record<string, unknown>;
  if ('organization' in record) {
    throw new UnsafeTenantQueryError(
      model,
      operation,
      'use organizationId implicitly, not a relation',
    );
  }
  if ('organizationId' in record && record.organizationId !== organizationId) {
    throw new UnsafeTenantQueryError(model, operation, 'organizationId must not be set by callers');
  }
  return { ...record, organizationId };
}

/**
 * Returns a Prisma client that automatically restricts every tenant model query to the
 * organization returned by `getOrganizationId()` (read at query time from the request context).
 *
 * - reads / updateMany / deleteMany get `AND organizationId = <current>`
 * - creates get `organizationId = <current>`
 * - findUnique / update / delete / upsert are forbidden on tenant models (cannot be scoped);
 *   use findFirst / updateMany / deleteMany and check the result instead.
 * - models that are neither tenant models nor Organization are not reachable at all.
 */
export function createTenantClient(prisma: PrismaClient, getOrganizationId: () => string) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const organizationId = getOrganizationId();
          const mutableArgs = (args ?? {}) as Record<string, unknown>;

          if (model === ORGANIZATION_MODEL) {
            if (SCOPED_OPERATIONS.has(operation)) {
              scopeWhere(mutableArgs, { id: organizationId });
              return query(mutableArgs);
            }
            throw new UnsafeTenantQueryError(
              model,
              operation,
              'operation not allowed on Organization',
            );
          }

          if (!TENANT_MODELS.has(model)) {
            throw new UnsafeTenantQueryError(model, operation, 'model is not tenant-scoped');
          }

          if (SCOPED_OPERATIONS.has(operation)) {
            scopeWhere(mutableArgs, { organizationId });
            return query(mutableArgs);
          }

          if (CREATE_OPERATIONS.has(operation)) {
            const data = mutableArgs.data;
            mutableArgs.data = Array.isArray(data)
              ? data.map((d) => withOrganization(model, operation, d, organizationId))
              : withOrganization(model, operation, data, organizationId);
            return query(mutableArgs);
          }

          throw new UnsafeTenantQueryError(
            model,
            operation,
            'cannot be scoped; use findFirst/updateMany/deleteMany',
          );
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof createTenantClient>;
