import { z } from 'zod';
import { cleanName, optionalText, paginatedSchema, paginationQuerySchema } from './common';
import { ProductUnit } from './enums';

export const PRODUCT_NAME_MAX = 150;
export const PRODUCT_CODE_MAX = 40;

/** Product as returned by the api. Money/weight are decimal strings, never JS floats. */
export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  rateCode: z.string().nullable(),
  /** e.g. "2180.00" */
  retailPrice: z.string(),
  tradePrice: z.string(),
  costPrice: z.string(),
  /** e.g. "4.5" (in `unit`) */
  weight: z.string().nullable(),
  unit: z.enum(ProductUnit).nullable(),
  piecesPerCarton: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const productListSchema = paginatedSchema(productSchema);

/** GET /products query. `q` matches name or code. */
export const listProductsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type ListProductsQuery = z.output<typeof listProductsQuerySchema>;
export type ListProductsQueryInput = z.input<typeof listProductsQuerySchema>;

const productName = z
  .string({ message: 'Product name is required' })
  .transform(cleanName)
  .pipe(
    z
      .string()
      .min(1, 'Product name is required')
      .max(PRODUCT_NAME_MAX, `Product name must be at most ${PRODUCT_NAME_MAX} characters`),
  );

/** Required money amount as a decimal string: ≥ 0, up to 12 digits and 2 decimals. */
const money = (label: string) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d{1,12}(\.\d{1,2})?$/, `${label} must be an amount like 2180 or 2180.50`);

/** Form inputs send "" for an empty optional field; treat it (and null) as "not set". */
const blankToNull = (value: unknown) => (value === '' || value === null ? null : value);

const optionalCode = z
  .string()
  .trim()
  .max(PRODUCT_CODE_MAX, `Product code must be at most ${PRODUCT_CODE_MAX} characters`)
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const optionalWeight = z
  .preprocess(
    (v) => blankToNull(typeof v === 'string' ? v.trim() : v),
    z
      .string({ message: 'Weight must be a number like 4.5 (up to 3 decimals)' })
      .regex(/^\d{1,9}(\.\d{1,3})?$/, {
        message: 'Weight must be a number like 4.5 (up to 3 decimals)',
        abort: true,
      })
      .refine((v) => Number(v) > 0, 'Weight must be greater than 0')
      .nullable(),
  )
  .optional();

const optionalUnit = z
  .preprocess(
    blankToNull,
    z.enum(ProductUnit, { message: 'Choose KG, Gram, Liter or ML' }).nullable(),
  )
  .optional();

const optionalPiecesPerCarton = z
  .preprocess(
    (v) => {
      const value = blankToNull(typeof v === 'string' ? v.trim() : v);
      return typeof value === 'string' ? Number(value) : value;
    },
    z
      .number({ message: 'Pieces per carton must be a whole number' })
      .int('Pieces per carton must be a whole number')
      .min(1, 'Pieces per carton must be at least 1')
      .max(100_000, 'Pieces per carton is too large')
      .nullable(),
  )
  .optional();

const productFields = {
  name: productName,
  code: optionalCode,
  rateCode: optionalText(PRODUCT_CODE_MAX),
  retailPrice: money('Retail price'),
  tradePrice: money('Trade price'),
  costPrice: money('Cost price'),
  weight: optionalWeight,
  unit: optionalUnit,
  piecesPerCarton: optionalPiecesPerCarton,
};

/** POST /products — Name, Retail, Trade and Cost Price are required (D-22). */
export const createProductSchema = z.object(productFields);
export type CreateProductInput = z.input<typeof createProductSchema>;
export type CreateProduct = z.output<typeof createProductSchema>;

/** PATCH /products/:id — any subset; optional fields can be cleared with "" or null. */
export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type UpdateProduct = z.output<typeof updateProductSchema>;
