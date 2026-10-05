import Decimal from 'decimal.js';
import { z } from 'zod';
import { optionalText, paginatedSchema, paginationQuerySchema } from './common';
import { ProductType, ProductUnit, WeightBasis } from './enums';
import { productSchema } from './products';

/**
 * Invoices (docs/invoice-specification.md, D-29). The calculator in this file is the only place
 * the invoice formulas live: the api uses it as the authority when an invoice is confirmed, the
 * web uses it for the live preview. All math uses Decimal with ROUND_HALF_UP — never JS numbers.
 */

export const InvoiceStatus = {
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
};

export const INVOICE_MAX_LINES = 200;
export const INVOICE_MAX_QUANTITY = 100_000;

/** Total weight is kept in KG (KG and Gram products) or Liter (Liter and ML products). */
export const TotalWeightUnit = { KG: 'KG', LITER: 'LITER' } as const;
export type TotalWeightUnit = (typeof TotalWeightUnit)[keyof typeof TotalWeightUnit];

// ---------------------------------------------------------------------------------------------
// Decimal arithmetic
// ---------------------------------------------------------------------------------------------

/** Decimal with plenty of precision and ROUND_HALF_UP (756.725 → 756.73). */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Dec = InstanceType<typeof D>;

const money = (value: Dec) => value.toDecimalPlaces(2, D.ROUND_HALF_UP);
const weight3 = (value: Dec) => value.toDecimalPlaces(3, D.ROUND_HALF_UP);

/** Parses a decimal string the schemas already validated; anything else is "not a number". */
function dec(value: string | null | undefined): Dec | null {
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(text)) return null;
  return new D(text);
}

// ---------------------------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------------------------

/** Required amount ≥ 0 with up to 2 decimals, sent as a string. */
const amount = (label: string) =>
  z
    .string({ message: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d{1,12}(\.\d{1,2})?$/, `${label} must be an amount like 2102 or 2102.50`);

/** Optional amount: "" / null / missing → null. */
const optionalAmount = (label: string) =>
  z
    .preprocess(
      (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
      z
        .string({ message: `${label} must be an amount like 500 or 500.50` })
        .regex(/^\d{1,12}(\.\d{1,2})?$/, `${label} must be an amount like 500 or 500.50`)
        .nullable(),
    )
    .optional();

/** Rate per unit of weight (TO / ATO): ≥ 0, up to 4 decimals; blank means 0. */
const ratePerWeight = (label: string) =>
  z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? '0' : v),
    z
      .string({ message: `${label} must be a number like 5 or 2.5` })
      .trim()
      .regex(/^\d{1,8}(\.\d{1,4})?$/, `${label} must be a number like 5 or 2.5`),
  );

const gstRate = z
  .string({ message: 'GST rate is required' })
  .trim()
  .min(1, 'GST rate is required')
  .regex(/^\d{1,3}(\.\d{1,2})?$/, { message: 'GST rate must be like 18 or 17.5', abort: true })
  .refine((v) => Number(v) <= 100, 'GST rate must be 100 or less');

const quantity = (label: string) =>
  z
    .number({ message: `${label} must be a whole number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(
      INVOICE_MAX_QUANTITY,
      `${label} must be at most ${INVOICE_MAX_QUANTITY.toLocaleString('en-US')}`,
    );

/** YYYY-MM-DD, a real calendar date. */
export const businessDateSchema = z
  .string({ message: 'Choose a date' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Choose a valid date');

/**
 * One invoice row as entered on the form. Which quantity counts depends on the product type,
 * which the server reads from the product (TIN: qtyPcs; POUCH: qtyCtn, qtyPcs display only).
 */
export const invoiceLineInputSchema = z.object({
  productId: z.uuid({ message: 'Choose a product' }),
  qtyCtn: quantity('Qty (Ctn)').nullable().optional(),
  qtyPcs: quantity('Qty (Pcs)').nullable().optional(),
  retailPrice: amount('Retail price'),
  tradePrice: amount('Trade price'),
  gstRate,
  toRate: ratePerWeight('TO rate'),
  atoRate: ratePerWeight('ATO rate'),
  specialDiscount: z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? '0' : v),
    amount('Special discount'),
  ),
});
export type InvoiceLineInput = z.input<typeof invoiceLineInputSchema>;
export type InvoiceLine = z.output<typeof invoiceLineInputSchema>;

/**
 * POST /invoices (and /invoices/preview). Only inputs are accepted: the invoice number, all
 * calculated values and every snapshot are produced by the server. `orderId` links a PENDING order
 * of the same shop. Advance Tax, Further Tax and ADT discount are optional Admin entries; Payable
 * Value is always calculated by the server (D-31) — a client-sent value is ignored.
 */
export const createInvoiceSchema = z.object({
  shopId: z.uuid({ message: 'Choose a shop' }),
  orderId: z.uuid().nullable().optional(),
  invoiceDate: businessDateSchema,
  items: z
    .array(invoiceLineInputSchema, { message: 'Add at least one product' })
    .min(1, 'Add at least one product')
    .max(INVOICE_MAX_LINES, `An invoice can have at most ${INVOICE_MAX_LINES} products`),
  advanceTax: optionalAmount('Advance tax'),
  furtherTax: optionalAmount('Further tax'),
  adtDiscount: optionalAmount('ADT / special discount'),
  duePayment: optionalAmount('Due payment'),
  notes: optionalText(500),
});
export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreateInvoice = z.output<typeof createInvoiceSchema>;

export const cancelInvoiceSchema = z.object({
  reason: z
    .string({ message: 'Enter the reason for cancelling' })
    .trim()
    .min(3, 'Enter the reason for cancelling')
    .max(300, 'Reason must be at most 300 characters'),
});
export type CancelInvoice = z.output<typeof cancelInvoiceSchema>;

export const listInvoicesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  shopId: z.uuid().optional(),
  status: z.enum(InvoiceStatus).optional(),
});
export type ListInvoicesQuery = z.output<typeof listInvoicesQuerySchema>;
export type ListInvoicesQueryInput = z.input<typeof listInvoicesQuerySchema>;

/** GET /invoices/draft — one of the two must be given. */
export const invoiceDraftQuerySchema = z
  .object({ shopId: z.uuid().optional(), orderId: z.uuid().optional() })
  .refine((q) => Boolean(q.shopId) !== Boolean(q.orderId), 'Give either shopId or orderId');
export type InvoiceDraftQuery = z.output<typeof invoiceDraftQuerySchema>;

// ---------------------------------------------------------------------------------------------
// Calculator (the formulas — docs/invoice-specification.md §3–4)
// ---------------------------------------------------------------------------------------------

/** What the calculator needs from the product (its current values, or the invoice snapshot). */
export interface InvoiceProductFacts {
  type: ProductType;
  piecesPerCarton: number | null;
  weight: string | null;
  weightUnit: ProductUnit | null;
  weightBasis: WeightBasis | null;
}

export interface InvoiceLineValues {
  qtyCtn?: number | null;
  qtyPcs?: number | null;
  tradePrice: string;
  gstRate: string;
  toRate: string;
  atoRate: string;
  specialDiscount: string;
  /** Profit only; never part of the shop's invoice values. */
  invoiceCostPrice?: string | null;
}

export interface CalculatedInvoiceLine {
  /** null for a TIN (not used) */
  qtyCtn: number | null;
  qtyPcs: number | null;
  totalWeight: string;
  totalWeightUnit: TotalWeightUnit | null;
  valueExclTax: string;
  gstAmount: string;
  valueInclGst: string;
  toAmount: string;
  atoAmount: string;
  specialDiscount: string;
  totalTradeOffer: string;
  grossValue: string;
  /** pricing quantity × invoice/cost price; null when no cost price was given */
  costTotal: string | null;
}

export type InvoiceLineField =
  | 'qtyCtn'
  | 'qtyPcs'
  | 'tradePrice'
  | 'gstRate'
  | 'toRate'
  | 'atoRate'
  | 'specialDiscount'
  | 'productId';

export interface InvoiceLineIssue {
  field: InvoiceLineField;
  message: string;
}

const WEIGHT_TO_TOTAL: Record<ProductUnit, { unit: TotalWeightUnit; factor: string }> = {
  KG: { unit: 'KG', factor: '1' },
  GRAM: { unit: 'KG', factor: '0.001' },
  LITER: { unit: 'LITER', factor: '1' },
  ML: { unit: 'LITER', factor: '0.001' },
};

/**
 * Initial quantities for a row (D-28): a TIN counts pieces; a POUCH counts cartons and its pieces
 * are Qty Ctn × Pieces per Carton (display / reference only).
 */
export function initialQuantities(
  product: Pick<InvoiceProductFacts, 'type' | 'piecesPerCarton'>,
  quantity: number,
): { qtyCtn: number | null; qtyPcs: number | null } {
  if (product.type === 'TIN') return { qtyCtn: null, qtyPcs: quantity };
  return {
    qtyCtn: quantity,
    qtyPcs: product.piecesPerCarton ? quantity * product.piecesPerCarton : null,
  };
}

/**
 * Total Weight of a row from the product's stored weight rules (never from its name):
 * - per-piece weight × pieces, per-carton weight × cartons;
 * - a POUCH with a per-piece weight: weight × Qty Ctn × Pieces per Carton (the financial quantity,
 *   not the editable display pieces);
 * - a TIN with a per-carton weight: weight × Qty Pcs ÷ Pieces per Carton;
 * - Gram / ML are converted to KG / Liter. Rounded to 3 decimals (half up).
 * Returns null when the weight cannot be worked out (missing pieces per carton).
 */
function totalWeightFor(
  product: InvoiceProductFacts,
  pricingQuantity: Dec,
): { value: Dec; unit: TotalWeightUnit | null } | null {
  const w = dec(product.weight);
  if (!w || !product.weightUnit || !product.weightBasis) return { value: new D(0), unit: null };
  const { unit, factor } = WEIGHT_TO_TOTAL[product.weightUnit];
  const perUnit = w.times(factor);
  const ppc = product.piecesPerCarton;
  let total: Dec;
  if (product.type === 'POUCH') {
    if (product.weightBasis === 'CARTON') total = perUnit.times(pricingQuantity);
    else if (ppc) total = perUnit.times(pricingQuantity).times(ppc);
    else return null;
  } else {
    if (product.weightBasis === 'PIECE') total = perUnit.times(pricingQuantity);
    else if (ppc) total = perUnit.times(pricingQuantity).dividedBy(ppc);
    else return null;
  }
  return { value: weight3(total), unit };
}

/**
 * One invoice row (D-29):
 *   pricing qty      = Qty Pcs (TIN) | Qty Ctn (POUCH)
 *   Value Excl Tax   = pricing qty × Trade Price
 *   GST Amount       = Value Excl Tax × GST Rate / 100          (rounded to 2, half up)
 *   Value Incl GST   = Value Excl Tax + GST Amount
 *   TO Amount        = TO Rate × Total Weight                    (rounded to 2)
 *   ATO Amount       = ATO Rate × Total Weight                   (rounded to 2)
 *   Total Trade Offer = TO Amount + ATO Amount + Special Discount
 *   Gross Value      = Value Incl GST − Total Trade Offer
 *   Cost (profit)    = pricing qty × Invoice/Cost Price          (never in the shop's totals)
 * Retail Price and the display pieces of a POUCH never take part.
 */
export function calculateInvoiceLine(
  product: InvoiceProductFacts,
  values: InvoiceLineValues,
): { line: CalculatedInvoiceLine | null; issues: InvoiceLineIssue[] } {
  const issues: InvoiceLineIssue[] = [];
  const isTin = product.type === 'TIN';
  const qtyCtn = isTin ? null : (values.qtyCtn ?? null);
  const qtyPcs =
    values.qtyPcs ??
    (isTin
      ? null
      : qtyCtn !== null && product.piecesPerCarton
        ? qtyCtn * product.piecesPerCarton
        : null);
  const pricingQty = isTin ? qtyPcs : qtyCtn;

  if (pricingQty === null || !Number.isInteger(pricingQty) || pricingQty < 1) {
    issues.push({
      field: isTin ? 'qtyPcs' : 'qtyCtn',
      message: isTin ? 'Enter Qty (Pcs) of at least 1' : 'Enter Qty (Ctn) of at least 1',
    });
  }
  const tradePrice = dec(values.tradePrice);
  if (!tradePrice) issues.push({ field: 'tradePrice', message: 'Enter the trade price' });
  const rate = dec(values.gstRate);
  if (!rate || rate.greaterThan(100))
    issues.push({ field: 'gstRate', message: 'Enter the GST rate' });
  const toRate = dec(values.toRate);
  if (!toRate) issues.push({ field: 'toRate', message: 'TO rate must be a number' });
  const atoRate = dec(values.atoRate);
  if (!atoRate) issues.push({ field: 'atoRate', message: 'ATO rate must be a number' });
  const specialDiscount = dec(values.specialDiscount);
  if (!specialDiscount) {
    issues.push({ field: 'specialDiscount', message: 'Special discount must be an amount' });
  }
  if (issues.length > 0 || pricingQty === null) return { line: null, issues };

  const qty = new D(pricingQty);
  const weight = totalWeightFor(product, qty);
  if (!weight) {
    return {
      line: null,
      issues: [
        {
          field: 'productId',
          message: 'This product needs Pieces per Carton to work out its weight',
        },
      ],
    };
  }
  const hasWeight = weight.unit !== null;
  if (!hasWeight && !toRate!.isZero()) {
    issues.push({ field: 'toRate', message: 'This product has no weight, so TO cannot apply' });
  }
  if (!hasWeight && !atoRate!.isZero()) {
    issues.push({ field: 'atoRate', message: 'This product has no weight, so ATO cannot apply' });
  }

  const valueExclTax = money(qty.times(tradePrice!));
  const gstAmount = money(valueExclTax.times(rate!).dividedBy(100));
  const valueInclGst = valueExclTax.plus(gstAmount);
  const toAmount = money(toRate!.times(weight.value));
  const atoAmount = money(atoRate!.times(weight.value));
  const discount = money(specialDiscount!);
  const totalTradeOffer = toAmount.plus(atoAmount).plus(discount);
  const grossValue = valueInclGst.minus(totalTradeOffer);
  if (grossValue.isNegative()) {
    issues.push({
      field: 'specialDiscount',
      message: 'Total trade offer is more than the value incl. GST',
    });
  }
  const cost = dec(values.invoiceCostPrice ?? null);

  return {
    line: {
      qtyCtn,
      qtyPcs,
      totalWeight: weight.value.toFixed(3),
      totalWeightUnit: weight.unit,
      valueExclTax: valueExclTax.toFixed(2),
      gstAmount: gstAmount.toFixed(2),
      valueInclGst: valueInclGst.toFixed(2),
      toAmount: toAmount.toFixed(2),
      atoAmount: atoAmount.toFixed(2),
      specialDiscount: discount.toFixed(2),
      totalTradeOffer: totalTradeOffer.toFixed(2),
      grossValue: grossValue.toFixed(2),
      costTotal: cost ? money(qty.times(cost)).toFixed(2) : null,
    },
    issues,
  };
}

export interface InvoiceTotals {
  totalValueExclTax: string;
  totalGstAmount: string;
  totalValueInclGst: string;
  totalTradeOffer: string;
  /** Σ Gross Invoice Value of all rows */
  grandTotal: string;
  /** Σ row cost; null when any row has no cost */
  totalCost: string | null;
}

/** Grand Total = Σ Gross Invoice Value. Invoice-level optional values are never added in. */
export function calculateInvoiceTotals(lines: CalculatedInvoiceLine[]): InvoiceTotals {
  const sum = (pick: (l: CalculatedInvoiceLine) => string) =>
    lines.reduce((acc, l) => acc.plus(pick(l)), new D(0)).toFixed(2);
  return {
    totalValueExclTax: sum((l) => l.valueExclTax),
    totalGstAmount: sum((l) => l.gstAmount),
    totalValueInclGst: sum((l) => l.valueInclGst),
    totalTradeOffer: sum((l) => l.totalTradeOffer),
    grandTotal: sum((l) => l.grossValue),
    totalCost: lines.every((l) => l.costTotal !== null) ? sum((l) => l.costTotal!) : null,
  };
}

/**
 * Payable Value — the final amount of the invoice, and the amount debited to the shop ledger
 * (D-31). Blank optional amounts count as zero; Due Payment never takes part.
 *
 *   Payable Value = Grand Total + Advance Tax + Further Tax − ADT / invoice-level Special Discount
 */
export function calculatePayableValue(values: {
  grandTotal: string;
  advanceTax?: string | null;
  furtherTax?: string | null;
  adtDiscount?: string | null;
}): string {
  const opt = (v: string | null | undefined) => dec(v ?? null) ?? new D(0);
  const grand = dec(values.grandTotal) ?? new D(values.grandTotal);
  return money(
    grand.plus(opt(values.advanceTax)).plus(opt(values.furtherTax)).minus(opt(values.adtDiscount)),
  ).toFixed(2);
}

/** "Optional" invoice-level amounts: blank or zero are not stored and not printed. */
export function optionalInvoiceAmount(value: string | null | undefined): string | null {
  const d = dec(value ?? null);
  return d && !d.isZero() ? money(d).toFixed(2) : null;
}

// ---------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------

const refSchema = z.object({ id: z.uuid(), name: z.string() });

/** Shop as printed on the invoice — snapshotted when the invoice is confirmed. */
export const invoiceShopSnapshotSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  contactPerson: z.string().nullable(),
  ntn: z.string().nullable(),
  strn: z.string().nullable(),
  cnic: z.string().nullable(),
  /** Shop category, printed as "Channel" */
  category: z.string().nullable(),
  area: z.string(),
});
export type InvoiceShopSnapshot = z.infer<typeof invoiceShopSnapshotSchema>;

/** Distributor (organization) as printed on the invoice — snapshotted. */
export const invoiceDistributorSnapshotSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  town: z.string().nullable(),
  phone: z.string().nullable(),
  ntn: z.string().nullable(),
  strn: z.string().nullable(),
});
export type InvoiceDistributorSnapshot = z.infer<typeof invoiceDistributorSnapshotSchema>;

export const invoiceItemSchema = z.object({
  id: z.uuid(),
  lineNo: z.number().int(),
  productId: z.uuid(),
  productCode: z.string().nullable(),
  productName: z.string(),
  productType: z.enum(ProductType),
  retailPrice: z.string(),
  tradePrice: z.string(),
  invoiceCostPrice: z.string(),
  piecesPerCarton: z.number().int().nullable(),
  weight: z.string().nullable(),
  weightUnit: z.enum(ProductUnit).nullable(),
  weightBasis: z.enum(WeightBasis).nullable(),
  qtyCtn: z.number().int().nullable(),
  qtyPcs: z.number().int().nullable(),
  totalWeight: z.string(),
  totalWeightUnit: z.enum(TotalWeightUnit).nullable(),
  gstRate: z.string(),
  valueExclTax: z.string(),
  gstAmount: z.string(),
  valueInclGst: z.string(),
  toRate: z.string(),
  toAmount: z.string(),
  atoRate: z.string(),
  atoAmount: z.string(),
  specialDiscount: z.string(),
  totalTradeOffer: z.string(),
  grossValue: z.string(),
  costTotal: z.string(),
});
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export const invoiceSummarySchema = z.object({
  id: z.uuid(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  status: z.enum(InvoiceStatus),
  shop: refSchema,
  order: z.object({ id: z.uuid(), orderNumber: z.string() }).nullable(),
  itemCount: z.number().int(),
  grandTotal: z.string(),
  createdAt: z.string(),
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export const invoiceListSchema = paginatedSchema(invoiceSummarySchema);

export const invoiceDetailsSchema = invoiceSummarySchema.extend({
  shopSnapshot: invoiceShopSnapshotSchema,
  distributor: invoiceDistributorSnapshotSchema,
  currency: z.string(),
  items: z.array(invoiceItemSchema),
  totalValueExclTax: z.string(),
  totalGstAmount: z.string(),
  totalValueInclGst: z.string(),
  totalTradeOffer: z.string(),
  totalCost: z.string(),
  advanceTax: z.string().nullable(),
  furtherTax: z.string().nullable(),
  adtDiscount: z.string().nullable(),
  duePayment: z.string().nullable(),
  /** Grand Total + Advance Tax + Further Tax − ADT discount; always printed (D-31) */
  payableValue: z.string(),
  notes: z.string().nullable(),
  createdBy: refSchema,
  cancelledAt: z.string().nullable(),
  cancelledBy: refSchema.nullable(),
  cancelReason: z.string().nullable(),
});
export type InvoiceDetails = z.infer<typeof invoiceDetailsSchema>;

/** POST /invoices/preview — what the server would save, without saving. */
export const invoicePreviewSchema = z.object({
  items: z.array(
    z.object({
      productId: z.uuid(),
      qtyCtn: z.number().int().nullable(),
      qtyPcs: z.number().int().nullable(),
      totalWeight: z.string(),
      totalWeightUnit: z.enum(TotalWeightUnit).nullable(),
      valueExclTax: z.string(),
      gstAmount: z.string(),
      valueInclGst: z.string(),
      toAmount: z.string(),
      atoAmount: z.string(),
      specialDiscount: z.string(),
      totalTradeOffer: z.string(),
      grossValue: z.string(),
    }),
  ),
  totalValueExclTax: z.string(),
  totalGstAmount: z.string(),
  totalValueInclGst: z.string(),
  totalTradeOffer: z.string(),
  grandTotal: z.string(),
  payableValue: z.string(),
});
export type InvoicePreview = z.infer<typeof invoicePreviewSchema>;

/** A prefilled row of the invoice form: current product values (and order quantities). */
export const invoiceDraftLineSchema = z.object({
  product: productSchema,
  qtyCtn: z.number().int().nullable(),
  qtyPcs: z.number().int().nullable(),
});
export type InvoiceDraftLine = z.infer<typeof invoiceDraftLineSchema>;

/**
 * GET /invoices/draft — everything the form needs to open: the shop, the source order (if any)
 * with its lines, the proposed number (final number is assigned on confirm), today's date in the
 * organization timezone and the Due Payment default (the shop's outstanding balance; the shop
 * ledger arrives in Phase 5, so it is null until then).
 */
export const invoiceDraftSchema = z.object({
  shop: refSchema.extend({
    isActive: z.boolean(),
    address: z.string().nullable(),
    area: z.string(),
    category: z.string().nullable(),
  }),
  order: z.object({ id: z.uuid(), orderNumber: z.string() }).nullable(),
  proposedInvoiceNumber: z.string(),
  invoiceDate: z.string(),
  duePayment: z.string().nullable(),
  defaultTaxRate: z.string(),
  items: z.array(invoiceDraftLineSchema),
});
export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;
