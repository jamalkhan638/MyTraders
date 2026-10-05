import { z } from 'zod';
import { ProductType, QuantityUnit } from './enums';
import { ExpenseStatus } from './expenses';
import { businessDateSchema, InvoiceStatus } from './invoices';
import { profitSummarySchema } from './profit';
import { UNASSIGNED } from './shops';

/**
 * Reports (docs/product-requirements.md §4.13, Phase 7). Every figure comes from the existing
 * domain rules — no report has a formula of its own:
 *
 *   Sales          = Σ Payable Value of CONFIRMED invoices (D-31, D-33; cancelled excluded)
 *   Market Credit  = Σ Shop Ledger outstanding balances (D-30)
 *   Cash Collected = PAYMENT ledger entries only
 *   Product Cost   = invoice item cost snapshots (D-33)
 *   Gross Profit   = Payable Value − Product Cost; Net Profit = Gross − ACTIVE expenses (D-32, D-33)
 *   Weight         = invoice item Total Weight snapshots, KG + Gram ÷ 1000 + Liter + ML ÷ 1000 (D-35)
 *
 * Date-ranged reports default to the current month in the organization timezone; the resolved
 * period is echoed back. A report returns at most REPORT_ROW_LIMIT rows (`truncated` tells when
 * more matched); its totals always cover every matching row.
 */
export const REPORT_ROW_LIMIT = 5000;

/** Order booker filter value for invoices made directly by the Admin (no order). */
export const DIRECT_SALE = 'direct';

const periodQuery = {
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
};
const salesFilters = {
  ...periodQuery,
  areaId: z.uuid().optional(),
  shopId: z.uuid().optional(),
  /** the booker of the order the invoice came from, or "direct" for invoices without an order */
  orderBookerId: z.union([z.uuid(), z.literal(DIRECT_SALE)]).optional(),
};
const shopFilters = {
  q: z.string().trim().max(100).optional(),
  areaId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  /** the shop's assigned order booker, or "unassigned" */
  orderBookerId: z.union([z.uuid(), z.literal(UNASSIGNED)]).optional(),
  status: z.enum(['active', 'inactive']).optional(),
};

const ref = z.object({ id: z.uuid(), name: z.string() });
const period = z.object({ from: z.string(), to: z.string() });
const listMeta = { rowCount: z.number().int(), truncated: z.boolean() };

// ---- Sales --------------------------------------------------------------------------------

export const salesReportQuerySchema = z.object(salesFilters);
export type SalesReportQuery = z.output<typeof salesReportQuerySchema>;
export type SalesReportQueryInput = z.input<typeof salesReportQuerySchema>;

export const salesReportSchema = z.object({
  period,
  rows: z.array(
    z.object({
      invoiceId: z.uuid(),
      invoiceNumber: z.string(),
      invoiceDate: z.string(),
      shop: ref,
      /** the shop's area */
      area: ref,
      /** booker of the linked order; null for a direct invoice */
      orderBooker: ref.nullable(),
      payableValue: z.string(),
      weightKg: z.string(),
    }),
  ),
  ...listMeta,
  totals: z.object({
    invoiceCount: z.number().int(),
    payableValue: z.string(),
    weightKg: z.string(),
    weightTons: z.string(),
  }),
});
export type SalesReport = z.infer<typeof salesReportSchema>;

// ---- Invoices -----------------------------------------------------------------------------

export const invoiceReportQuerySchema = z.object({
  ...salesFilters,
  status: z.enum(InvoiceStatus).optional(),
});
export type InvoiceReportQuery = z.output<typeof invoiceReportQuerySchema>;
export type InvoiceReportQueryInput = z.input<typeof invoiceReportQuerySchema>;

export const invoiceReportSchema = z.object({
  period,
  rows: z.array(
    z.object({
      id: z.uuid(),
      invoiceNumber: z.string(),
      invoiceDate: z.string(),
      status: z.enum(InvoiceStatus),
      shop: ref,
      area: ref,
      orderBooker: ref.nullable(),
      grandTotal: z.string(),
      /** null = not entered (not printed on the invoice) */
      advanceTax: z.string().nullable(),
      furtherTax: z.string().nullable(),
      adtDiscount: z.string().nullable(),
      payableValue: z.string(),
    }),
  ),
  ...listMeta,
  /** confirmed invoices only — cancelled invoices never count */
  totals: z.object({
    invoiceCount: z.number().int(),
    grandTotal: z.string(),
    advanceTax: z.string(),
    furtherTax: z.string(),
    adtDiscount: z.string(),
    payableValue: z.string(),
  }),
  cancelledCount: z.number().int(),
});
export type InvoiceReport = z.infer<typeof invoiceReportSchema>;

// ---- Shop credit --------------------------------------------------------------------------

export const shopCreditReportQuerySchema = z.object({
  ...shopFilters,
  /** "owing" (default) = shops whose outstanding balance is above zero */
  balance: z.enum(['owing', 'all']).default('owing'),
});
export type ShopCreditReportQuery = z.output<typeof shopCreditReportQuerySchema>;
export type ShopCreditReportQueryInput = z.input<typeof shopCreditReportQuerySchema>;

export const shopCreditReportSchema = z.object({
  rows: z.array(
    z.object({
      shop: ref.extend({ isActive: z.boolean() }),
      area: ref,
      orderBooker: ref.nullable(),
      phone: z.string().nullable(),
      outstanding: z.string(),
      lastPaymentDate: z.string().nullable(),
      lastInvoiceDate: z.string().nullable(),
    }),
  ),
  ...listMeta,
  totals: z.object({
    /** Σ outstanding of the shops matching the filters */
    outstanding: z.string(),
    shopsOwing: z.number().int(),
  }),
  /** Total Market Credit of the whole organization (all shops, GET /ledger/market-credit) */
  marketCredit: z.string(),
});
export type ShopCreditReport = z.infer<typeof shopCreditReportSchema>;

// ---- Product sales ------------------------------------------------------------------------

export const productSalesReportQuerySchema = z.object({
  ...salesFilters,
  productId: z.uuid().optional(),
  type: z.enum(ProductType).optional(),
});
export type ProductSalesReportQuery = z.output<typeof productSalesReportQuerySchema>;
export type ProductSalesReportQueryInput = z.input<typeof productSalesReportQuerySchema>;

export const productSalesReportSchema = z.object({
  period,
  rows: z.array(
    z.object({
      product: ref.extend({ code: z.string().nullable() }),
      /** product type as invoiced (snapshot) — decides the quantity unit */
      type: z.enum(ProductType),
      /** TIN: Σ Qty Pcs (pieces) · POUCH: Σ Qty Ctn (cartons) — the pricing quantities */
      quantity: z.number().int(),
      quantityUnit: z.enum(QuantityUnit),
      weightKg: z.string(),
      /** Σ line Gross Value (Value Incl GST − Trade Offer) */
      salesValue: z.string(),
      /** Σ line cost snapshots */
      productCost: z.string(),
      /** Product Line Profit = salesValue − productCost (invoice-level amounts excluded, D-37) */
      profit: z.string(),
    }),
  ),
  ...listMeta,
  totals: z.object({
    pieces: z.number().int(),
    cartons: z.number().int(),
    weightKg: z.string(),
    weightTons: z.string(),
    salesValue: z.string(),
    productCost: z.string(),
    profit: z.string(),
  }),
  /**
   * Invoice-level amounts belong to the invoice as a whole and are never allocated to products
   * (D-37 — no proration). They are shown separately so the report reconciles exactly with the
   * Profit report for the same invoices:
   *
   *   Product Profit Subtotal (Σ row profit = Σ line Gross Value − Σ line cost snapshot)
   *   + Advance Tax + Further Tax − invoice-level ADT / Special Discount
   *   = Gross Profit (= Payable Value − Product Cost)
   *
   * null when a product or type filter is set (invoice-level amounts cannot be narrowed to a
   * product).
   */
  reconciliation: z
    .object({
      productProfit: z.string(),
      advanceTax: z.string(),
      furtherTax: z.string(),
      adtDiscount: z.string(),
      grossProfit: z.string(),
      payableValue: z.string(),
      productCost: z.string(),
    })
    .nullable(),
});
export type ProductSalesReport = z.infer<typeof productSalesReportSchema>;

// ---- Expenses -----------------------------------------------------------------------------

export const expenseReportQuerySchema = z.object({
  ...periodQuery,
  categoryId: z.uuid().optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'voided', 'all']).default('all'),
});
export type ExpenseReportQuery = z.output<typeof expenseReportQuerySchema>;
export type ExpenseReportQueryInput = z.input<typeof expenseReportQuerySchema>;

export const expenseReportSchema = z.object({
  period,
  rows: z.array(
    z.object({
      id: z.uuid(),
      expenseDate: z.string(),
      category: ref,
      description: z.string().nullable(),
      reference: z.string().nullable(),
      amount: z.string(),
      status: z.enum(ExpenseStatus),
      voidReason: z.string().nullable(),
    }),
  ),
  ...listMeta,
  totals: z.object({
    /** Σ ACTIVE expenses matching the filters — the only total that counts */
    active: z.string(),
    activeCount: z.number().int(),
    /** shown for reference; never part of any total */
    voided: z.string(),
    voidedCount: z.number().int(),
  }),
  /** ACTIVE expenses by category */
  byCategory: z.array(z.object({ category: ref, total: z.string(), count: z.number().int() })),
});
export type ExpenseReport = z.infer<typeof expenseReportSchema>;

// ---- Profit -------------------------------------------------------------------------------

export const profitReportQuerySchema = z.object(periodQuery);
export type ProfitReportQuery = z.output<typeof profitReportQuerySchema>;
export type ProfitReportQueryInput = z.input<typeof profitReportQuerySchema>;

/** Months listed per period at most; longer ranges show the summary only. */
export const PROFIT_REPORT_MAX_MONTHS = 24;

export const profitReportSchema = z.object({
  /** exactly GET /profit/summary for the period */
  summary: profitSummarySchema,
  /** the same figures per calendar month of the period (clipped to it), oldest first */
  byMonth: z.array(profitSummarySchema.extend({ month: z.string() })),
});
export type ProfitReport = z.infer<typeof profitReportSchema>;

// ---- Shop list ----------------------------------------------------------------------------

export const shopListReportQuerySchema = z.object(shopFilters);
export type ShopListReportQuery = z.output<typeof shopListReportQuerySchema>;
export type ShopListReportQueryInput = z.input<typeof shopListReportQuerySchema>;

export const shopListReportSchema = z.object({
  rows: z.array(
    z.object({
      shop: ref,
      area: ref,
      category: ref.nullable(),
      orderBooker: ref.nullable(),
      contactPerson: z.string().nullable(),
      phone: z.string().nullable(),
      address: z.string().nullable(),
      outstanding: z.string(),
      isActive: z.boolean(),
    }),
  ),
  ...listMeta,
  totals: z.object({ shopCount: z.number().int(), outstanding: z.string() }),
});
export type ShopListReport = z.infer<typeof shopListReportSchema>;
