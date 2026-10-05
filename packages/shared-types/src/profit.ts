import { z } from 'zod';
import { businessDateSchema } from './invoices';

/**
 * Profit (docs/product-requirements.md §4.11, D-33) — MVP rule confirmed by the owner:
 *
 *   Invoice Profit = Gross Invoice Value (Grand Total = Σ line Gross Value)
 *                    − Product Cost (Σ line cost snapshot: TIN Qty Pcs × Invoice/Cost Price,
 *                                    POUCH Qty Ctn × Invoice/Cost Price)
 *   Gross Profit   = Σ Invoice Profit of CONFIRMED (not cancelled) invoices dated in the period
 *   Net Profit     = Gross Profit − Expenses (Σ ACTIVE expenses dated in the period)
 *
 * GST / tax is not separately removed (future business-rule review); tax actually paid by the
 * distributor is recorded as an Expense (e.g. "Tax / Government Tax") and reduces Net Profit.
 */
export const profitQuerySchema = z.object({
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
});
export type ProfitQuery = z.output<typeof profitQuerySchema>;

export const profitSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  invoiceCount: z.number().int(),
  /** Σ Gross Invoice Value (Grand Total) of confirmed invoices */
  grossInvoiceValue: z.string(),
  /** Σ product cost snapshots of those invoices */
  productCost: z.string(),
  grossProfit: z.string(),
  expenses: z.string(),
  netProfit: z.string(),
});
export type ProfitSummary = z.infer<typeof profitSummarySchema>;
