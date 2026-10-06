import { type OrganizationStatus, type PrismaClient } from '@prisma/client';
import { DEFAULT_EXPENSE_CATEGORIES, normalizeName } from '@mytraders/shared-types';
import * as argon2 from 'argon2';

/**
 * Creating a tenant: the organization, its document-number counters, the default expense
 * categories and its first Admin, in one transaction. Shared by the Super Admin API
 * (`POST /platform/tenants`) and the `org:create` CLI.
 */
export interface CreateOrganizationInput {
  name: string;
  status?: OrganizationStatus;
  currency?: string;
  timezone?: string;
  invoicePrefix?: string;
  invoiceNumberDigits?: number;
  admin: { name: string; email: string; password: string };
}

/** Creates an organization, its first Admin, number counters and default expense categories in one transaction. */
export async function createOrganizationWithAdmin(
  prisma: PrismaClient,
  input: CreateOrganizationInput,
) {
  const passwordHash = await argon2.hash(input.admin.password, { type: argon2.argon2id });
  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.name,
        status: input.status ?? 'ACTIVE',
        currency: input.currency,
        timezone: input.timezone,
        invoicePrefix: input.invoicePrefix,
        invoiceNumberDigits: input.invoiceNumberDigits,
      },
    });
    await tx.organizationCounter.createMany({
      data: [
        { organizationId: organization.id, key: 'ORDER' },
        { organizationId: organization.id, key: 'INVOICE' },
      ],
    });
    await tx.expenseCategory.createMany({
      data: DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
        organizationId: organization.id,
        name,
        nameNormalized: normalizeName(name),
      })),
    });
    const admin = await tx.user.create({
      data: {
        organizationId: organization.id,
        name: input.admin.name,
        email: input.admin.email.trim().toLowerCase(),
        passwordHash,
        role: 'ADMIN',
      },
    });
    return { organization, admin };
  });
}
