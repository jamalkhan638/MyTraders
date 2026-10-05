import { BadRequestException, Injectable } from '@nestjs/common';
import {
  type ProductSalesReport,
  type ProductType,
  type ProfitQuery,
  type ProfitSummary,
  quantityUnitFor,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { type SalesFilter, salesWhere, WEIGHED_ITEM } from './sales-scope';

const Decimal = Prisma.Decimal;
const zero = new Decimal(0);
const money = (value: Prisma.Decimal | null | undefined) => (value ?? zero).toFixed(2);
const kg = (value: Prisma.Decimal | null | undefined) => (value ?? zero).toFixed(3);

/**
 * Gross and Net Profit for a period (D-33), from invoice snapshots only — never from current
 * product prices. Reusable by the Dashboard and Reports.
 *
 *   Invoice Profit = Payable Value (Grand Total + Advance Tax + Further Tax − ADT discount)
 *                    − Total Cost (Σ cost snapshots); Due Payment never counts
 *   Gross Profit   = Σ Invoice Profit, CONFIRMED invoices dated in [from, to]
 *   Net Profit     = Gross Profit − Σ ACTIVE expenses dated in [from, to]
 */
@Injectable()
export class ProfitService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly expenses: ExpensesService,
    private readonly tenant: TenantContext,
  ) {}

  async summary(query: ProfitQuery): Promise<ProfitSummary> {
    // The expense summary resolves the default period (current month, org timezone).
    const expenses = await this.expenses.summary(query);
    const { from, to } = expenses;
    if (from > to) {
      const message = '"To" must be on or after "From"';
      throw new BadRequestException({ message, details: [{ path: 'to', message }] });
    }
    const sales = await this.sales({ from, to });
    return {
      from,
      to,
      invoiceCount: sales.invoiceCount,
      payableValue: sales.payableValue,
      productCost: sales.productCost,
      grossProfit: sales.grossProfit,
      expenses: expenses.total,
      netProfit: new Decimal(sales.grossProfit).minus(expenses.total).toFixed(2),
    };
  }

  /**
   * Sales totals of the invoices matching a filter: Σ Payable Value, Σ cost snapshots, Gross
   * Profit (Payable Value − Product Cost, D-33) and Σ Grand Total (the part made of product lines).
   */
  async sales(filter: SalesFilter) {
    const sums = await this.db.client.invoice.aggregate({
      where: salesWhere(filter),
      _sum: { payableValue: true, totalCost: true, grandTotal: true },
      _count: { _all: true },
    });
    const payable = sums._sum.payableValue ?? zero;
    const cost = sums._sum.totalCost ?? zero;
    return {
      invoiceCount: sums._count._all,
      payableValue: money(payable),
      productCost: money(cost),
      grossProfit: money(payable.minus(cost)),
      grandTotal: money(sums._sum.grandTotal),
    };
  }

  // ---- sales views (Sales = Σ Payable Value of CONFIRMED invoices, the same base as profit) ----

  /** Sales per calendar month for `months` months ending with the month of `to`, oldest first. */
  async salesByMonth(to: string, months: number): Promise<{ month: string; sales: string }[]> {
    const organizationId = this.tenant.requireOrganizationId();
    const [y, m] = to.split('-').map(Number);
    const keys = Array.from({ length: months }, (_, i) => {
      const d = new Date(Date.UTC(y, m - 1 - (months - 1 - i), 1));
      return d.toISOString().slice(0, 7);
    });
    const rows = await this.db.client.$queryRaw<{ month: string; sales: string }[]>`
      SELECT to_char("invoiceDate", 'YYYY-MM') AS "month", SUM("payableValue")::text AS "sales"
      FROM "Invoice"
      WHERE "organizationId" = ${organizationId}::uuid
        AND "status" = 'CONFIRMED'
        AND "invoiceDate" >= ${`${keys[0]}-01`}::date
        AND "invoiceDate" <= ${to}::date
      GROUP BY 1`;
    const byMonth = new Map(rows.map((r) => [r.month, new Prisma.Decimal(r.sales).toFixed(2)]));
    return keys.map((month) => ({ month, sales: byMonth.get(month) ?? '0.00' }));
  }

  /** Top shops by Sales in [from, to] (one grouped query + one name lookup). */
  async topShops(from: string, to: string, limit: number) {
    const groups = await this.db.client.invoice.groupBy({
      by: ['shopId'],
      where: salesWhere({ from, to }),
      _sum: { payableValue: true },
      _count: { _all: true },
      orderBy: { _sum: { payableValue: 'desc' } },
      take: limit,
    });
    const shops = await this.db.client.shop.findMany({
      where: { id: { in: groups.map((g) => g.shopId) } },
      select: { id: true, name: true },
    });
    const names = new Map(shops.map((s) => [s.id, s.name]));
    return groups.map((g) => ({
      shop: { id: g.shopId, name: names.get(g.shopId) ?? '' },
      sales: money(g._sum.payableValue),
      invoiceCount: g._count._all,
    }));
  }

  /**
   * Weight sold by the invoices matching a filter, from the invoice item snapshots (D-35). Items
   * carry their Total Weight already converted to KG (KG / Gram ÷ 1000) or Liter (Liter / ML ÷
   * 1000); by the business rule 1 Liter = 1 KG both are added together. Items without a weight add
   * nothing. Tons = KG ÷ 1000.
   */
  async weightSold(filter: SalesFilter): Promise<{ kg: string; tons: string }> {
    const sums = await this.db.client.invoiceItem.aggregate({
      where: { ...WEIGHED_ITEM, invoice: salesWhere(filter) },
      _sum: { totalWeight: true },
    });
    const total = sums._sum.totalWeight ?? zero;
    return { kg: kg(total), tons: total.dividedBy(1000).toFixed(3) };
  }

  /** Weight (KG, same rule as `weightSold`) of each of the given invoices. Missing → "0.000". */
  async weightByInvoice(invoiceIds: string[]): Promise<Map<string, string>> {
    if (invoiceIds.length === 0) return new Map();
    const groups = await this.db.client.invoiceItem.groupBy({
      by: ['invoiceId'],
      where: { ...WEIGHED_ITEM, invoiceId: { in: invoiceIds } },
      _sum: { totalWeight: true },
    });
    return new Map(groups.map((g) => [g.invoiceId, kg(g._sum.totalWeight)]));
  }

  /**
   * Sales per product of the invoices matching a filter, from the item snapshots. The quantity is
   * the pricing quantity of the type the product had on the invoice — TIN: Σ Qty Pcs (pieces),
   * POUCH: Σ Qty Ctn (cartons) — so pieces and cartons are never added together. Sales value =
   * Σ line Gross Value, cost = Σ line cost snapshot, profit = sales value − cost. Invoice-level
   * Advance Tax, Further Tax and ADT discount belong to no product (see `sales()` for them).
   */
  async productSales(
    filter: SalesFilter & { productId?: string; type?: ProductType },
  ): Promise<ProductSalesReport['rows']> {
    const where: Prisma.InvoiceItemWhereInput = {
      invoice: salesWhere(filter),
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.type ? { productType: filter.type } : {}),
    };
    const [groups, weights] = await Promise.all([
      this.db.client.invoiceItem.groupBy({
        by: ['productId', 'productType'],
        where,
        _sum: { qtyPcs: true, qtyCtn: true, grossValue: true, costTotal: true },
      }),
      this.db.client.invoiceItem.groupBy({
        by: ['productId', 'productType'],
        where: { ...where, ...WEIGHED_ITEM },
        _sum: { totalWeight: true },
      }),
    ]);
    const products = await this.db.client.product.findMany({
      where: { id: { in: [...new Set(groups.map((g) => g.productId))] } },
      select: { id: true, name: true, code: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const key = (g: { productId: string; productType: string }) =>
      `${g.productId}:${g.productType}`;
    const weightOf = new Map(weights.map((w) => [key(w), w._sum.totalWeight]));
    return groups
      .map((g) => {
        const sales = g._sum.grossValue ?? zero;
        const cost = g._sum.costTotal ?? zero;
        const product = byId.get(g.productId);
        return {
          product: { id: g.productId, name: product?.name ?? '', code: product?.code ?? null },
          type: g.productType,
          quantity: (g.productType === 'POUCH' ? g._sum.qtyCtn : g._sum.qtyPcs) ?? 0,
          quantityUnit: quantityUnitFor(g.productType),
          weightKg: kg(weightOf.get(key(g))),
          salesValue: money(sales),
          productCost: money(cost),
          profit: money(sales.minus(cost)),
        };
      })
      .sort(
        (a, b) =>
          new Decimal(b.salesValue).comparedTo(a.salesValue) ||
          a.product.name.localeCompare(b.product.name),
      );
  }

  /** Date of each shop's latest sale (confirmed invoice), for the shops matching `shopWhere`. */
  async lastSaleDates(shopWhere: Prisma.ShopWhereInput): Promise<Map<string, string>> {
    const groups = await this.db.client.invoice.groupBy({
      by: ['shopId'],
      where: { status: 'CONFIRMED', shop: shopWhere },
      _max: { invoiceDate: true },
    });
    return new Map(
      groups
        .filter((g) => g._max.invoiceDate)
        .map((g) => [g.shopId, g._max.invoiceDate!.toISOString().slice(0, 10)]),
    );
  }
}
