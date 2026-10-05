/** Expense categories, e.g. Fuel, Salary, Rent — configurable per organization (docs §4.10). */
import { z } from 'zod';
import { cleanName, paginatedSchema, paginationQuerySchema } from './common';

export const EXPENSE_CATEGORY_NAME_MAX = 100;

export const expenseCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const expenseCategoryListSchema = paginatedSchema(expenseCategorySchema);

/** GET /expense-categories query. */
export const listExpenseCategoriesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type ListExpenseCategoriesQuery = z.output<typeof listExpenseCategoriesQuerySchema>;
export type ListExpenseCategoriesQueryInput = z.input<typeof listExpenseCategoriesQuerySchema>;

const categoryName = z
  .string({ message: 'Category name is required' })
  .transform(cleanName)
  .pipe(
    z
      .string()
      .min(1, 'Category name is required')
      .max(
        EXPENSE_CATEGORY_NAME_MAX,
        `Category name must be at most ${EXPENSE_CATEGORY_NAME_MAX} characters`,
      ),
  );

/** POST /expense-categories */
export const createExpenseCategorySchema = z.object({ name: categoryName });
export type CreateExpenseCategoryInput = z.input<typeof createExpenseCategorySchema>;

/** PATCH /expense-categories/:id — rename and/or activate/deactivate. */
export const updateExpenseCategorySchema = z.object({
  name: categoryName.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateExpenseCategoryInput = z.input<typeof updateExpenseCategorySchema>;

/** Categories every new organization starts with (docs §4.10); the Admin can rename or add more. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Fuel',
  'Salary',
  'Vehicle Maintenance',
  'Loading / Unloading',
  'Rent',
  'Electricity',
  'Office Expense',
  'Miscellaneous',
] as const;
