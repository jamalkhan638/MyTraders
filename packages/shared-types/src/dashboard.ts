import { z } from 'zod';
import { orderSummarySchema } from './orders';

/**
 * GET /dashboard/summary (docs/product-requirements.md §4.12, D-34) — every card from real data in
 * one response. "This month" = calendar month in the organization timezone. Amounts are decimal
 * strings.
 */
export const dashboardSummarySchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  /** orders with status PENDING */
  pendingOrders: z.number().int(),
  /** Σ outstanding Shop Ledger balance of all shops (D-30) */
  marketCredit: z.string(),
  shopsWithBalance: z.number().int(),
  /** Σ Payable Value of CONFIRMED invoices dated this month (D-31) */
  monthlySales: z.string(),
  monthlyInvoiceCount: z.number().int(),
  /**
   * Σ invoice item Total Weight of confirmed invoices this month, in KG: KG + Gram ÷ 1000 +
   * Liter + ML ÷ 1000 (business rule 1 L = 1 KG, D-35); items without a weight add nothing
   */
  monthlyWeightKg: z.string(),
  /** the same in tons (KG ÷ 1000) */
  monthlyWeightTons: z.string(),
  /** Σ ACTIVE expenses dated this month (D-32) */
  monthlyExpenses: z.string(),
  /** /profit/summary for this month (D-33) */
  monthlyGrossProfit: z.string(),
  monthlyNetProfit: z.string(),
  /** Σ PAYMENT ledger credits dated this month — no adjustments, no reversals */
  monthlyCashCollected: z.string(),
  /** last 6 calendar months, oldest first, months without sales = "0.00" */
  salesByMonth: z.array(z.object({ month: z.string(), sales: z.string() })),
  /** top 5 shops by Payable Value this month */
  topShops: z.array(
    z.object({
      shop: z.object({ id: z.uuid(), name: z.string() }),
      sales: z.string(),
      invoiceCount: z.number().int(),
    }),
  ),
  /** newest 5 pending orders */
  recentPendingOrders: z.array(orderSummarySchema),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
