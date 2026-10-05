import {
  OrganizationStatus,
  ProductType,
  ProductUnit,
  UserRole,
  WeightBasis,
} from '@mytraders/shared-types';
import {
  OrganizationStatus as PrismaOrganizationStatus,
  ProductType as PrismaProductType,
  ProductUnit as PrismaProductUnit,
  UserRole as PrismaUserRole,
  WeightBasis as PrismaWeightBasis,
} from '@prisma/client';

describe('shared enums', () => {
  it('match the Prisma schema enums', () => {
    expect(Object.values(UserRole).sort()).toEqual(Object.values(PrismaUserRole).sort());
    expect(Object.values(OrganizationStatus).sort()).toEqual(
      Object.values(PrismaOrganizationStatus).sort(),
    );
    expect(Object.values(ProductUnit).sort()).toEqual(Object.values(PrismaProductUnit).sort());
    expect(Object.values(ProductType).sort()).toEqual(Object.values(PrismaProductType).sort());
    expect(Object.values(WeightBasis).sort()).toEqual(Object.values(PrismaWeightBasis).sort());
  });
});
