import { z } from 'zod';
import { optionalText, paginatedSchema, paginationQuerySchema } from './common';
import { businessDateSchema } from './invoices';

/**
 * Shop ledger (docs/product-requirements.md §4.5, D-30). The ledger is the single source of truth
 * for shop credit: Outstanding Balance = Σ debit − Σ credit. Debit = the shop owes more; credit =
 * the shop owes less. Amounts are decimal strings, never JS numbers.
 */

export const LedgerEntryType = {
  INVOICE: 'INVOICE',
  PAYMENT: 'PAYMENT',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  INVOICE_REVERSAL: 'INVOICE_REVERSAL',
} as const;
export type LedgerEntryType = (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const LEDGER_ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  INVOICE: 'Invoice',
  PAYMENT: 'Payment',
  MANUAL_ADJUSTMENT: 'Adjustment',
  INVOICE_REVERSAL: 'Invoice cancelled',
};

export const PaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CHEQUE: 'CHEQUE',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

export const AdjustmentDirection = { INCREASE: 'INCREASE', DECREASE: 'DECREASE' } as const;
export type AdjustmentDirection = (typeof AdjustmentDirection)[keyof typeof AdjustmentDirection];

/** Amount > 0 with up to 2 decimals, as a string. */
const positiveAmount = (label: string) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d{1,12}(\.\d{1,2})?$/, {
      message: `${label} must be an amount like 2000 or 2000.50`,
      abort: true,
    })
    .refine((v) => /[1-9]/.test(v), `${label} must be more than 0`);

/**
 * POST /shops/:shopId/payments (Admin). Creates a Payment and its PAYMENT ledger credit. A payment
 * larger than the current outstanding balance is rejected (D-6). Dates in the future are rejected.
 */
export const recordPaymentSchema = z.object({
  amount: positiveAmount('Amount'),
  paymentDate: businessDateSchema,
  method: z.enum(PaymentMethod, { message: 'Choose a payment method' }).default('CASH'),
  reference: optionalText(80),
  notes: optionalText(500),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
export type RecordPayment = z.output<typeof recordPaymentSchema>;

/**
 * POST /shops/:shopId/adjustments (Admin). A MANUAL_ADJUSTMENT entry: INCREASE = debit (e.g. old
 * khata credit, D-5), DECREASE = credit (may not take the balance below zero). Reason required.
 */
export const adjustCreditSchema = z.object({
  direction: z.enum(AdjustmentDirection, { message: 'Choose increase or decrease' }),
  amount: positiveAmount('Amount'),
  adjustmentDate: businessDateSchema,
  reason: z
    .string({ message: 'Enter the reason for this adjustment' })
    .trim()
    .min(3, 'Enter the reason for this adjustment')
    .max(500, 'Reason must be at most 500 characters'),
});
export type AdjustCreditInput = z.input<typeof adjustCreditSchema>;
export type AdjustCredit = z.output<typeof adjustCreditSchema>;

const refSchema = z.object({ id: z.uuid(), name: z.string() });

/** One ledger line as shown in the shop's credit history (newest first). */
export const ledgerEntrySchema = z.object({
  id: z.uuid(),
  type: z.enum(LedgerEntryType),
  transactionDate: z.string(),
  debit: z.string(),
  credit: z.string(),
  /** balance after this entry, in (transactionDate, createdAt, id) order — computed by the server */
  runningBalance: z.string(),
  notes: z.string().nullable(),
  invoice: z.object({ id: z.uuid(), invoiceNumber: z.string() }).nullable(),
  payment: z
    .object({ id: z.uuid(), method: z.enum(PaymentMethod), reference: z.string().nullable() })
    .nullable(),
  createdBy: refSchema,
  createdAt: z.string(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const shopBalanceSchema = z.object({
  shopId: z.uuid(),
  outstandingBalance: z.string(),
  totalDebit: z.string(),
  totalCredit: z.string(),
});
export type ShopBalance = z.infer<typeof shopBalanceSchema>;

/** GET /shops/:shopId/ledger — the balance and a page of history. */
export const shopLedgerSchema = paginatedSchema(ledgerEntrySchema).extend({
  balance: shopBalanceSchema,
});
export type ShopLedger = z.infer<typeof shopLedgerSchema>;
export const shopLedgerQuerySchema = paginationQuerySchema;
export type ShopLedgerQueryInput = z.input<typeof shopLedgerQuerySchema>;

/** Result of recording a payment or an adjustment. */
export const ledgerPostingSchema = z.object({
  entry: ledgerEntrySchema,
  balance: shopBalanceSchema,
});
export type LedgerPosting = z.infer<typeof ledgerPostingSchema>;

/**
 * GET /ledger/areas/:areaId?date= — the area collection sheet for one business date, computed
 * from shop ledger entries only (no stored area balances):
 *   opening  = Σ(debit − credit) before the date
 *   payments = Σ PAYMENT credits on the date
 *   dayDebit = Σ debits on the date (invoices, increases)
 *   dayOtherCredit = Σ non-payment credits on the date (decreases, invoice reversals)
 *   closing  = Σ(debit − credit) up to and including the date
 *            = opening + dayDebit − dayOtherCredit − payments
 */
export const areaLedgerQuerySchema = z.object({
  date: businessDateSchema,
  q: z.string().trim().max(100).optional(),
  outstandingOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type AreaLedgerQuery = z.output<typeof areaLedgerQuerySchema>;
export type AreaLedgerQueryInput = z.input<typeof areaLedgerQuerySchema>;

const areaLedgerAmounts = {
  openingBalance: z.string(),
  dayDebit: z.string(),
  dayOtherCredit: z.string(),
  payments: z.string(),
  closingBalance: z.string(),
};

export const areaLedgerRowSchema = z.object({
  shop: refSchema.extend({ isActive: z.boolean() }),
  ...areaLedgerAmounts,
  /** balance today, whatever date is shown — the limit for a new payment */
  currentBalance: z.string(),
  /** last payment on or before the date */
  lastPaymentDate: z.string().nullable(),
});
export type AreaLedgerRow = z.infer<typeof areaLedgerRowSchema>;

export const areaLedgerSchema = z.object({
  area: refSchema,
  date: z.string(),
  rows: z.array(areaLedgerRowSchema),
  totals: z.object(areaLedgerAmounts),
});
export type AreaLedger = z.infer<typeof areaLedgerSchema>;

/** GET /ledger/market-credit — Σ outstanding of all shops (used by the Dashboard later). */
export const marketCreditSchema = z.object({
  marketCredit: z.string(),
  shopsWithBalance: z.number().int(),
});
export type MarketCredit = z.infer<typeof marketCreditSchema>;
