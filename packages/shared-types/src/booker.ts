import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from './common';
import { ProductType, ProductUnit, WeightBasis } from './enums';

/**
 * Read-only views for the Order Booker app (docs §4.7). They deliberately contain no prices,
 * cost, tax or credit (D-24).
 */

export const bookerShopSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  contactPerson: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  area: z.object({ id: z.uuid(), name: z.string() }),
});
export type BookerShop = z.infer<typeof bookerShopSchema>;
export const bookerShopListSchema = paginatedSchema(bookerShopSchema);

/** GET /booker/shops — the signed-in booker's active assigned shops. */
export const listBookerShopsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  areaId: z.uuid().optional(),
});
export type ListBookerShopsQuery = z.output<typeof listBookerShopsQuerySchema>;
export type ListBookerShopsQueryInput = z.input<typeof listBookerShopsQuerySchema>;

export const bookerAreaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  shopCount: z.number().int(),
});
export type BookerArea = z.infer<typeof bookerAreaSchema>;

/** Active product as the booker sees it: identification only, no prices. */
export const bookerProductSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  type: z.enum(ProductType),
  weight: z.string().nullable(),
  weightUnit: z.enum(ProductUnit).nullable(),
  weightBasis: z.enum(WeightBasis).nullable(),
  piecesPerCarton: z.number().int().nullable(),
});
export type BookerProduct = z.infer<typeof bookerProductSchema>;
export const bookerProductListSchema = paginatedSchema(bookerProductSchema);

/** GET /booker/products — active products; `q` matches name or code. */
export const listBookerProductsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
});
export type ListBookerProductsQuery = z.output<typeof listBookerProductsQuerySchema>;
export type ListBookerProductsQueryInput = z.input<typeof listBookerProductsQuerySchema>;
