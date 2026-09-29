/**
 * Development seed. DEV ONLY — these passwords are public.
 * Creates two organizations (to try tenant isolation) and one platform Super Admin.
 * Safe to re-run: existing seed data is left untouched.
 */
import { PrismaClient } from '@prisma/client';
import { createOrganizationWithAdmin, createUser } from '../scripts/lib/organizations';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed a production database');

  if (!(await prisma.user.findUnique({ where: { email: 'admin@demo.test' } }))) {
    const { organization } = await createOrganizationWithAdmin(prisma, {
      name: 'Demo Traders',
      invoicePrefix: 'M-',
      invoiceNumberDigits: 8,
      admin: { name: 'Demo Admin', email: 'admin@demo.test', password: 'Admin@12345' },
    });
    await createUser(prisma, {
      organizationId: organization.id,
      role: 'ORDER_BOOKER',
      name: 'Ahmed (Order Booker)',
      email: 'booker@demo.test',
      password: 'Booker@12345',
    });
  }

  if (!(await prisma.user.findUnique({ where: { email: 'admin@other.test' } }))) {
    await createOrganizationWithAdmin(prisma, {
      name: 'Other Distributor',
      admin: { name: 'Other Admin', email: 'admin@other.test', password: 'Admin@12345' },
    });
  }

  if (!(await prisma.user.findUnique({ where: { email: 'super@mytraders.test' } }))) {
    await createUser(prisma, {
      organizationId: null,
      role: 'SUPER_ADMIN',
      name: 'Platform Owner',
      email: 'super@mytraders.test',
      password: 'Super@12345',
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
