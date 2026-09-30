import { OrganizationStatus, ProductUnit, UserRole } from '@mytraders/shared-types';
import {
  OrganizationStatus as PrismaOrganizationStatus,
  ProductUnit as PrismaProductUnit,
  UserRole as PrismaUserRole,
} from '@prisma/client';

describe('shared enums', () => {
  it('match the Prisma schema enums', () => {
    expect(Object.values(UserRole).sort()).toEqual(Object.values(PrismaUserRole).sort());
    expect(Object.values(OrganizationStatus).sort()).toEqual(
      Object.values(PrismaOrganizationStatus).sort(),
    );
    expect(Object.values(ProductUnit).sort()).toEqual(Object.values(PrismaProductUnit).sort());
  });
});
