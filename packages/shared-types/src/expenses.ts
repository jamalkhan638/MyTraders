import { z } from 'zod';
import { optionalText, paginatedSchema, paginationQuerySchema } from './common';
import { businessDateSchema } from './invoices';

/**
 * Expenses (docs/product-requirements.md §4.10, D-32) — Admin only. Amounts are decimal strings.
 * Only ACTIVE expenses count in totals; they reduce Net Profit later (§4.11). No partner splitting.
 */

export const ExpenseStatus = { ACTIVE: 'ACTIVE', VOIDED: 'VOIDED' } as const;
export type ExpenseStatus = (typeof ExpenseStatus)[keyof typeof ExpenseStatus];

const amount = z
  .string({ message: 'Amount is required' })
  .trim()
  .min(1, 'Amount is required')
  .regex(/^\d{1,12}(\.\d{1,2})?$/, {
    message: 'Amount must be like 2500 or 2500.50',
    abort: true,
  })
  .refine((v) => /[1-9]/.test(v), 'Amount must be more than 0');

const expenseFields = {
  categoryId: z.uuid({ message: 'Choose a category' }),
  amount,
  /** not in the future (organization timezone); backdating is allowed */
  expenseDate: businessDateSchema,
  description: optionalText(500),
  reference: optionalText(80),
};

/** POST /expenses — the category must be an active category of the organization. */
export const createExpenseSchema = z.object(expenseFields);
export type CreateExpenseInput = z.input<typeof createExpenseSchema>;
export type CreateExpense = z.output<typeof createExpenseSchema>;

/** PATCH /expenses/:id — any subset; only while ACTIVE. A changed category must be active. */
export const updateExpenseSchema = z.object(expenseFields).partial();
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>;
export type UpdateExpense = z.output<typeof updateExpenseSchema>;

/** POST /expenses/:id/void — expenses are never deleted. */
export const voidExpenseSchema = z.object({
  reason: z
    .string({ message: 'Enter the reason' })
    .trim()
    .min(3, 'Enter the reason')
    .max(300, 'Reason must be at most 300 characters'),
});
export type VoidExpense = z.output<typeof voidExpenseSchema>;

const refSchema = z.object({ id: z.uuid(), name: z.string() });

export const expenseSchema = z.object({
  id: z.uuid(),
  category: refSchema.extend({ isActive: z.boolean() }),
  amount: z.string(),
  expenseDate: z.string(),
  description: z.string().nullable(),
  reference: z.string().nullable(),
  status: z.enum(ExpenseStatus),
  createdBy: refSchema,
  updatedBy: refSchema.nullable(),
  voidedAt: z.string().nullable(),
  voidedBy: refSchema.nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Expense = z.infer<typeof expenseSchema>;

/** GET /expenses — filters; `q` matches description or reference. Default: active only. */
export const listExpensesQuerySchema = paginationQuerySchema.extend({
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
  categoryId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'voided']).default('active'),
});
export type ListExpensesQuery = z.output<typeof listExpensesQuerySchema>;
export type ListExpensesQueryInput = z.input<typeof listExpensesQuerySchema>;

/** The list plus the total of every expense matching the filters (not just this page). */
export const expenseListSchema = paginatedSchema(expenseSchema).extend({
  totalAmount: z.string(),
});
export type ExpenseList = z.infer<typeof expenseListSchema>;

/**
 * GET /expenses/summary?from&to — Σ ACTIVE expenses dated in [from, to] (both inclusive), by
 * category. Without dates: the current month in the organization timezone ("This Month
 * Expenses" for the Dashboard). Used later by Net Profit = Gross Profit − Expenses.
 */
export const expenseSummaryQuerySchema = z.object({
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
});
export type ExpenseSummaryQuery = z.output<typeof expenseSummaryQuerySchema>;

export const expenseSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  total: z.string(),
  count: z.number().int(),
  byCategory: z.array(
    z.object({ category: refSchema, total: z.string(), count: z.number().int() }),
  ),
});
export type ExpenseSummary = z.infer<typeof expenseSummarySchema>;
