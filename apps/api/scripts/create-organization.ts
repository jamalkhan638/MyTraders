/**
 * Creates a new organization (distributor) with its first Admin user.
 *
 *   pnpm --filter @mytraders/api org:create -- \
 *     --name "Ali Akbar Traders" --admin-name "Owner" \
 *     --admin-email owner@example.com --admin-password 'S3cure-pass!' \
 *     [--status ACTIVE|TRIAL] [--currency PKR] [--timezone Asia/Karachi] \
 *     [--invoice-prefix M-] [--invoice-digits 8]
 */
import { PrismaClient } from '@prisma/client';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createOrganizationWithAdmin } from './lib/organizations';

const argsSchema = z.object({
  name: z.string().trim().min(1),
  'admin-name': z.string().trim().min(1),
  'admin-email': z.email(),
  'admin-password': z.string().min(8, 'admin password must be at least 8 characters'),
  status: z.enum(['TRIAL', 'ACTIVE']).default('ACTIVE'),
  currency: z.string().length(3).optional(),
  timezone: z.string().optional(),
  'invoice-prefix': z.string().optional(),
  'invoice-digits': z.coerce.number().int().min(1).max(12).optional(),
});

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      'admin-name': { type: 'string' },
      'admin-email': { type: 'string' },
      'admin-password': { type: 'string' },
      status: { type: 'string' },
      currency: { type: 'string' },
      timezone: { type: 'string' },
      'invoice-prefix': { type: 'string' },
      'invoice-digits': { type: 'string' },
    },
  });
  const parsed = argsSchema.safeParse(values);
  if (!parsed.success) {
    console.error(z.prettifyError(parsed.error));
    process.exit(1);
  }
  const args = parsed.data;

  const prisma = new PrismaClient();
  try {
    const { organization, admin } = await createOrganizationWithAdmin(prisma, {
      name: args.name,
      status: args.status,
      currency: args.currency,
      timezone: args.timezone,
      invoicePrefix: args['invoice-prefix'],
      invoiceNumberDigits: args['invoice-digits'],
      admin: {
        name: args['admin-name'],
        email: args['admin-email'],
        password: args['admin-password'],
      },
    });
    console.log(`Created organization "${organization.name}" (${organization.id})`);
    console.log(`Admin: ${admin.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
