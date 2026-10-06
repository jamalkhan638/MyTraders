/**
 * Creates a platform Super Admin (no organization). There is no sign-up for this role.
 *
 *   SUPER_ADMIN_PASSWORD='…' pnpm --filter @mytraders/api super-admin:create -- \
 *     --name "Platform Owner" --email owner@mytraders.example
 */
import { emailSchema, passwordSchema } from '@mytraders/shared-types';
import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createUser } from './lib/organizations';

const argsSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  email: emailSchema,
  password: passwordSchema,
});

async function main() {
  // `pnpm super-admin:create -- --name …` forwards the "--" separator; skip it.
  const argv = process.argv.slice(2);
  const { values } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    options: { name: { type: 'string' }, email: { type: 'string' } },
  });
  const parsed = argsSchema.safeParse({ ...values, password: process.env.SUPER_ADMIN_PASSWORD });
  if (!parsed.success) {
    console.error(z.prettifyError(parsed.error));
    console.error('Set the password in SUPER_ADMIN_PASSWORD (kept out of the shell history).');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    if (await prisma.user.findUnique({ where: { email: parsed.data.email } })) {
      console.error(`${parsed.data.email} is already used by another account`);
      process.exit(1);
    }
    const user = await createUser(prisma, {
      organizationId: null,
      role: 'SUPER_ADMIN',
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    console.log(`Super Admin ${user.email} created — sign in at /login (lands on /platform)`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
