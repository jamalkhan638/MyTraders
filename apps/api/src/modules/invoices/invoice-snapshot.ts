import { type InvoiceChange } from '@mytraders/shared-types';
import { type Prisma } from '@prisma/client';

/** One line as kept in an invoice revision (D-41). Numbers are decimal strings. */
export interface InvoiceSnapshotLine {
  productId: string;
  productName: string;
  productCode: string | null;
  qtyCtn: number | null;
  qtyPcs: number | null;
  retailPrice: string;
  tradePrice: string;
  gstRate: string;
  toRate: string;
  atoRate: string;
  specialDiscount: string;
  grossValue: string;
}

/** The editable values of an invoice, before or after an edit (InvoiceRevision.previous/current). */
export interface InvoiceSnapshot {
  invoiceDate: string;
  advanceTax: string | null;
  furtherTax: string | null;
  adtDiscount: string | null;
  duePayment: string | null;
  notes: string | null;
  grandTotal: string;
  payableValue: string;
  totalCost: string;
  items: InvoiceSnapshotLine[];
}

type Dec = Prisma.Decimal;
const optional = (value: Dec | null) => (value === null ? null : value.toFixed(2));

/** Snapshot of a stored invoice and its lines. */
export function snapshotOf(
  invoice: {
    invoiceDate: Date;
    advanceTax: Dec | null;
    furtherTax: Dec | null;
    adtDiscount: Dec | null;
    duePayment: Dec | null;
    notes: string | null;
    grandTotal: Dec;
    payableValue: Dec;
    totalCost: Dec;
  },
  items: {
    productId: string;
    productName: string;
    productCode: string | null;
    qtyCtn: number | null;
    qtyPcs: number | null;
    retailPrice: Dec;
    tradePrice: Dec;
    gstRate: Dec;
    toRate: Dec;
    atoRate: Dec;
    specialDiscount: Dec;
    grossValue: Dec;
  }[],
): InvoiceSnapshot {
  return {
    invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
    advanceTax: optional(invoice.advanceTax),
    furtherTax: optional(invoice.furtherTax),
    adtDiscount: optional(invoice.adtDiscount),
    duePayment: optional(invoice.duePayment),
    notes: invoice.notes,
    grandTotal: invoice.grandTotal.toFixed(2),
    payableValue: invoice.payableValue.toFixed(2),
    totalCost: invoice.totalCost.toFixed(2),
    items: items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      productCode: item.productCode,
      qtyCtn: item.qtyCtn,
      qtyPcs: item.qtyPcs,
      retailPrice: item.retailPrice.toFixed(2),
      tradePrice: item.tradePrice.toFixed(2),
      gstRate: item.gstRate.toString(),
      toRate: item.toRate.toString(),
      atoRate: item.atoRate.toString(),
      specialDiscount: item.specialDiscount.toFixed(2),
      grossValue: item.grossValue.toFixed(2),
    })),
  };
}

const HEADER: [keyof InvoiceSnapshot, string][] = [
  ['invoiceDate', 'Invoice date'],
  ['advanceTax', 'Advance tax'],
  ['furtherTax', 'Further tax'],
  ['adtDiscount', 'ADT / special discount'],
  ['duePayment', 'Due payment'],
  ['notes', 'Notes'],
  ['grandTotal', 'Grand total'],
  ['payableValue', 'Invoice value'],
];

const LINE: [keyof InvoiceSnapshotLine, string][] = [
  ['qtyCtn', 'Qty (Ctn)'],
  ['qtyPcs', 'Qty (Pcs)'],
  ['retailPrice', 'R.P'],
  ['tradePrice', 'T.P'],
  ['gstRate', 'GST %'],
  ['toRate', 'TO rate'],
  ['atoRate', 'ATO rate'],
  ['specialDiscount', 'Special discount'],
  ['grossValue', 'Gross value'],
];

const show = (value: unknown) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

const describe = (line: InvoiceSnapshotLine) =>
  [
    line.qtyCtn !== null ? `${line.qtyCtn} ctn` : null,
    line.qtyPcs !== null ? `${line.qtyPcs} pcs` : null,
    `T.P ${line.tradePrice}`,
    `gross ${line.grossValue}`,
  ]
    .filter(Boolean)
    .join(', ');

/** Lines keyed by product (+ occurrence, if a product appears on several lines). */
function keyed(items: InvoiceSnapshotLine[]): Map<string, InvoiceSnapshotLine> {
  const seen = new Map<string, number>();
  const result = new Map<string, InvoiceSnapshotLine>();
  for (const item of items) {
    const n = (seen.get(item.productId) ?? 0) + 1;
    seen.set(item.productId, n);
    result.set(n === 1 ? item.productId : `${item.productId}#${n}`, item);
  }
  return result;
}

/** What changed between two snapshots, as display rows for the edit history. */
export function diffSnapshots(before: InvoiceSnapshot, after: InvoiceSnapshot): InvoiceChange[] {
  const changes: InvoiceChange[] = [];
  for (const [field, label] of HEADER) {
    if (show(before[field]) !== show(after[field])) {
      changes.push({ field, label, from: show(before[field]), to: show(after[field]) });
    }
  }
  const old = keyed(before.items);
  const next = keyed(after.items);
  for (const [key, line] of old) {
    const now = next.get(key);
    if (!now) {
      changes.push({
        field: `items.${key}`,
        label: `${line.productName} (removed)`,
        from: describe(line),
        to: '—',
      });
      continue;
    }
    for (const [field, label] of LINE) {
      if (show(line[field]) !== show(now[field])) {
        changes.push({
          field: `items.${key}.${field}`,
          label: `${line.productName} — ${label}`,
          from: show(line[field]),
          to: show(now[field]),
        });
      }
    }
  }
  for (const [key, line] of next) {
    if (!old.has(key)) {
      changes.push({
        field: `items.${key}`,
        label: `${line.productName} (added)`,
        from: '—',
        to: describe(line),
      });
    }
  }
  return changes;
}

/** True when an edit changes nothing the Admin entered (calculated values follow the inputs). */
export function sameInputs(before: InvoiceSnapshot, after: InvoiceSnapshot): boolean {
  const strip = ({
    grandTotal: _g,
    payableValue: _p,
    totalCost: _c,
    ...rest
  }: InvoiceSnapshot) => ({
    ...rest,
    items: rest.items.map(({ grossValue: _v, productName: _n, productCode: _k, ...line }) => line),
  });
  return JSON.stringify(strip(before)) === JSON.stringify(strip(after));
}
