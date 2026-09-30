/** Shop categories (shop types), e.g. Convenience Store, Wholesale — docs D-21. */
import { z } from 'zod';
import { cleanName, paginatedSchema, paginationQuerySchema } from './common';

export const SHOP_CATEGORY_NAME_MAX = 100;

export const shopCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ShopCategory = z.infer<typeof shopCategorySchema>;

export const shopCategoryListSchema = paginatedSchema(shopCategorySchema);

/** GET /shop-categories query. */
export const listShopCategoriesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type ListShopCategoriesQuery = z.output<typeof listShopCategoriesQuerySchema>;
export type ListShopCategoriesQueryInput = z.input<typeof listShopCategoriesQuerySchema>;

const categoryName = z
  .string({ message: 'Category name is required' })
  .transform(cleanName)
  .pipe(
    z
      .string()
      .min(1, 'Category name is required')
      .max(
        SHOP_CATEGORY_NAME_MAX,
        `Category name must be at most ${SHOP_CATEGORY_NAME_MAX} characters`,
      ),
  );

/** POST /shop-categories */
export const createShopCategorySchema = z.object({ name: categoryName });
export type CreateShopCategoryInput = z.input<typeof createShopCategorySchema>;

/** PATCH /shop-categories/:id — rename and/or activate/deactivate. */
export const updateShopCategorySchema = z.object({
  name: categoryName.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateShopCategoryInput = z.input<typeof updateShopCategorySchema>;
