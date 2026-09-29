/**
 * Enums shared by web and api. Values must match the Prisma enums in
 * apps/api/prisma/schema.prisma (checked by an api unit test).
 */
export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  ORDER_BOOKER: 'ORDER_BOOKER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const OrganizationStatus = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type OrganizationStatus = (typeof OrganizationStatus)[keyof typeof OrganizationStatus];
