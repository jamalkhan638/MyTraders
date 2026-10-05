import { z } from 'zod';
import { cleanName, paginatedSchema, paginationQuerySchema } from './common';

export const SHOP_NAME_MAX = 150;

const refSchema = z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() });

/** Shop as returned by the api, with the names of its area / category / order booker. */
export const shopSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  contactPerson: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  ntn: z.string().nullable(),
  strn: z.string().nullable(),
  cnic: z.string().nullable(),
  area: refSchema,
  category: refSchema.nullable(),
  assignedOrderBooker: refSchema.nullable(),
  isActive: z.boolean(),
  /** Σ debit − Σ credit of the shop ledger (D-30), computed by the server */
  outstandingBalance: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Shop = z.infer<typeof shopSchema>;

export const shopListSchema = paginatedSchema(shopSchema);

/** Value of `orderBookerId` that selects shops with no order booker. */
export const UNASSIGNED = 'unassigned';

/** GET /shops query. `q` matches shop name, contact person or phone. */
export const listShopsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  areaId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  orderBookerId: z.union([z.uuid(), z.literal(UNASSIGNED)]).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type ListShopsQuery = z.output<typeof listShopsQuerySchema>;
export type ListShopsQueryInput = z.input<typeof listShopsQuerySchema>;

/** Optional text: trimmed, "" / null clears it. */
const optionalField = (
  max: number,
  label: string,
  pattern?: { regex: RegExp; message: string },
) => {
  let base = z.string().trim().max(max, `${label} must be at most ${max} characters`);
  if (pattern) base = base.regex(pattern.regex, pattern.message);
  return z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), base.nullable())
    .optional();
};

/** Optional id: "" / null means "none". */
const optionalId = (message: string) =>
  z.preprocess((v) => (v === '' ? null : v), z.uuid({ message }).nullable()).optional();

const shopFields = {
  name: z
    .string({ message: 'Shop name is required' })
    .transform(cleanName)
    .pipe(
      z
        .string()
        .min(1, 'Shop name is required')
        .max(SHOP_NAME_MAX, `Shop name must be at most ${SHOP_NAME_MAX} characters`),
    ),
  contactPerson: optionalField(120, 'Contact person'),
  phone: optionalField(40, 'Phone', {
    regex: /^[0-9+\-() ]+$/,
    message: 'Phone may contain only digits, spaces and + - ( )',
  }),
  address: optionalField(300, 'Address'),
  ntn: optionalField(40, 'NTN'),
  strn: optionalField(40, 'STRN'),
  cnic: optionalField(20, 'CNIC', {
    regex: /^[0-9-]+$/,
    message: 'CNIC may contain only digits and dashes',
  }),
  areaId: z.uuid({ message: 'Area is required' }),
  categoryId: optionalId('Choose a valid shop category'),
  assignedOrderBookerId: optionalId('Choose a valid order booker'),
};

/** POST /shops — Name and Area are required. */
export const createShopSchema = z.object(shopFields);
export type CreateShopInput = z.input<typeof createShopSchema>;
export type CreateShop = z.output<typeof createShopSchema>;

/** PATCH /shops/:id — any subset; `isActive` activates/deactivates; null removes category/booker. */
export const updateShopSchema = createShopSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type UpdateShopInput = z.input<typeof updateShopSchema>;
export type UpdateShop = z.output<typeof updateShopSchema>;
