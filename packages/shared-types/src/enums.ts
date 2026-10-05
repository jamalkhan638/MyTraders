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

/** Unit of a product's weight value (docs D-22, D-26). */
export const ProductUnit = {
  KG: 'KG',
  GRAM: 'GRAM',
  LITER: 'LITER',
  ML: 'ML',
} as const;
export type ProductUnit = (typeof ProductUnit)[keyof typeof ProductUnit];

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  KG: 'KG',
  GRAM: 'Gram',
  LITER: 'Liter',
  ML: 'ML',
};

/**
 * How a product is invoiced (D-26): a TIN by pieces (Qty Pcs); a POUCH by cartons (Qty Ctn),
 * with Qty Pcs = Qty Ctn × Pieces per Carton shown for reference.
 */
export const ProductType = {
  TIN: 'TIN',
  POUCH: 'POUCH',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

/** What a product's weight refers to. */
export const WeightBasis = {
  PIECE: 'PIECE',
  CARTON: 'CARTON',
} as const;
export type WeightBasis = (typeof WeightBasis)[keyof typeof WeightBasis];

export const WEIGHT_BASIS_LABELS: Record<WeightBasis, string> = {
  PIECE: 'per piece',
  CARTON: 'per carton',
};
