import { type OrganizationStatus, type UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { type PrismaService } from '../../src/prisma/prisma.service';

export const TEST_PASSWORD = 'Password@123';
let cachedHash: Promise<string> | undefined;
const passwordHash = () => (cachedHash ??= argon2.hash(TEST_PASSWORD, { type: argon2.argon2id }));

export async function createOrganization(
  prisma: PrismaService,
  overrides: { name?: string; status?: OrganizationStatus } = {},
) {
  return prisma.organization.create({
    data: {
      name: overrides.name ?? `Org ${randomUUID().slice(0, 8)}`,
      status: overrides.status ?? 'ACTIVE',
    },
  });
}

export async function createUser(
  prisma: PrismaService,
  input: {
    organizationId: string | null;
    role: UserRole;
    email?: string;
    isActive?: boolean;
    name?: string;
  },
) {
  return prisma.user.create({
    data: {
      organizationId: input.organizationId,
      role: input.role,
      name: input.name ?? `${input.role} user`,
      email: (
        input.email ?? `${input.role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`
      ).toLowerCase(),
      passwordHash: await passwordHash(),
      isActive: input.isActive ?? true,
    },
  });
}
