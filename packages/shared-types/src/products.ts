import { z } from 'zod';
import { cleanName, paginatedSchema, paginationQuerySchema } from './common';
import { ProductType, ProductUnit, WeightBasis } from './enums';

export const PRODUCT_NAME_MAX = 150;
export const PRODUCT_CODE_MAX = 40;

/**
 * Product as returned by the api. Money/weight/rates are decimal strings, never JS floats.
 * Invoice rules (D-26): TIN is invoiced by pieces, POUCH by cartons (pieces = cartons × pieces per
 * carton, for display). Trade Price drives the invoice value, Invoice/Cost Price is for profit only,
 * Retail Price is display only. Default Tax Rate is only a default; invoices snapshot the rate used.
 */
export const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  type: z.enum(ProductType),
  /** e.g. "2180.00" — display / reference only */
  retailPrice: z.string(),
  /** drives the invoice value */
  tradePrice: z.string(),
  /** what the distributor pays the company — profit only */
  invoiceCostPrice: z.string(),
  /** percent, e.g. "18" or "17.5" */
  defaultTaxRate: z.string(),
  /** e.g. "4.5", in `weightUnit`, per `weightBasis` */
  weight: z.string().nullable(),
  weightUnit: z.enum(ProductUnit).nullable(),
  weightBasis: z.enum(WeightBasis).nullable(),
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
  type: z.enum(ProductType).optional(),
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

/** Required percentage as a decimal string: 0–100, up to 2 decimals. Never hard-coded. */
const taxRate = z
  .string({ message: 'Default tax rate is required' })
  .trim()
  .min(1, 'Default tax rate is required')
  .regex(/^\d{1,3}(\.\d{1,2})?$/, {
    message: 'Default tax rate must be a percentage like 18 or 17.5',
    abort: true,
  })
  .refine((v) => Number(v) <= 100, 'Default tax rate must be 100 or less');

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

const optionalWeightUnit = z
  .preprocess(
    blankToNull,
    z.enum(ProductUnit, { message: 'Choose KG, Gram, Liter or ML' }).nullable(),
  )
  .optional();

const optionalWeightBasis = z
  .preprocess(
    blankToNull,
    z.enum(WeightBasis, { message: 'Choose per piece or per carton' }).nullable(),
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
  type: z.enum(ProductType, { message: 'Choose TIN or POUCH' }),
  retailPrice: money('Retail price'),
  tradePrice: money('Trade price'),
  invoiceCostPrice: money('Invoice / cost price'),
  defaultTaxRate: taxRate,
  weight: optionalWeight,
  weightUnit: optionalWeightUnit,
  weightBasis: optionalWeightBasis,
  piecesPerCarton: optionalPiecesPerCarton,
};

/** The fields the cross-field rules look at (also used on PATCH with the stored values merged in). */
export interface ProductRuleFields {
  type: ProductType;
  weight?: unknown;
  weightUnit?: unknown;
  weightBasis?: unknown;
  piecesPerCarton?: unknown;
}

/**
 * Rules that involve several fields (D-26):
 * - a POUCH needs Pieces per Carton (Qty Pcs = Qty Ctn × Pieces per Carton);
 * - a weight needs its unit and whether it is per piece or per carton.
 */
export function productRuleIssues(p: ProductRuleFields): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  if (p.type === 'POUCH' && !p.piecesPerCarton) {
    issues.push({ path: 'piecesPerCarton', message: 'Pieces per carton is required for a POUCH' });
  }
  if (p.weight) {
    if (!p.weightUnit) issues.push({ path: 'weightUnit', message: 'Choose the weight unit' });
    if (!p.weightBasis) {
      issues.push({
        path: 'weightBasis',
        message: 'Choose whether the weight is per piece or per carton',
      });
    }
  }
  return issues;
}

/**
 * POST /products — Name, Type, Retail / Trade / Invoice-cost Price and Default Tax Rate are
 * required; POUCH also needs Pieces per Carton; a weight needs its unit and basis.
 */
export const createProductSchema = z.object(productFields).superRefine((product, ctx) => {
  for (const issue of productRuleIssues(product)) {
    ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
  }
});
export type CreateProductInput = z.input<typeof createProductSchema>;
export type CreateProduct = z.output<typeof createProductSchema>;

/**
 * PATCH /products/:id — any subset; optional fields can be cleared with "" or null. The
 * cross-field rules are checked by the api against the stored product merged with the changes.
 */
export const updateProductSchema = z
  .object(productFields)
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type UpdateProduct = z.output<typeof updateProductSchema>;

/**
 * Pieces shown for a quantity (D-26): a TIN is counted in pieces; for a POUCH the pieces are
 * cartons × pieces per carton (display / reference only).
 */
export function piecesFor(
  type: ProductType,
  quantity: number,
  piecesPerCarton: number | null,
): number | null {
  if (type === 'TIN') return quantity;
  return piecesPerCarton ? quantity * piecesPerCarton : null;
}
