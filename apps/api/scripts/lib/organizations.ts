import { type PrismaClient, type UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

export {
  type CreateOrganizationInput,
  createOrganizationWithAdmin,
} from '../../src/modules/platform/create-organization';

export async function createUser(
  prisma: PrismaClient,
  input: {
    organizationId: string | null;
    role: UserRole;
    name: string;
    email: string;
    password: string;
  },
) {
  return prisma.user.create({
    data: {
      organizationId: input.organizationId,
      role: input.role,
      name: input.name,
      email: input.email.trim().toLowerCase(),
      passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }),
    },
  });
}
