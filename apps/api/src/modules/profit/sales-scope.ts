import { DIRECT_SALE } from '@mytraders/shared-types';
import { type Prisma } from '@prisma/client';

/** Which invoices count as sales, for a period and optional report filters. */
export interface SalesFilter {
  from: string;
  to: string;
  areaId?: string;
  shopId?: string;
  /** booker of the order the invoice came from, or "direct" (no order) */
  orderBookerId?: string;
}

const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * The one definition of a sale (D-31, D-33, D-34): a CONFIRMED invoice (cancelled invoices are
 * excluded) dated in [from, to]. Used by profit, the dashboard and every sales report, so they
 * always agree. Area = the shop's area; order booker = the booker of the linked order.
 */
export function salesWhere(filter: SalesFilter): Prisma.InvoiceWhereInput {
  return {
    ...invoiceFilters(filter),
    status: 'CONFIRMED',
  };
}

/** The same filters without the status rule — for the invoice report, which lists cancelled too. */
export function invoiceFilters(filter: SalesFilter): Prisma.InvoiceWhereInput {
  return {
    invoiceDate: { gte: asDate(filter.from), lte: asDate(filter.to) },
    ...(filter.shopId ? { shopId: filter.shopId } : {}),
    ...(filter.areaId ? { shop: { areaId: filter.areaId } } : {}),
    ...(filter.orderBookerId === DIRECT_SALE
      ? { orderId: null }
      : filter.orderBookerId
        ? { order: { orderBookerId: filter.orderBookerId } }
        : {}),
  };
}

/**
 * Invoice items that carry a weight (D-35). Their Total Weight snapshot is already in KG (KG, or
 * Gram ÷ 1000) or Liter (Liter, or ML ÷ 1000), and 1 Liter = 1 KG, so the values are summed as KG.
 */
export const WEIGHED_ITEM = {
  totalWeightUnit: { not: null },
} as const satisfies Prisma.InvoiceItemWhereInput;
