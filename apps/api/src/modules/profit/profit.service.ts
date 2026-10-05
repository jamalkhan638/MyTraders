import { BadRequestException, Injectable } from '@nestjs/common';
import { type ProfitQuery, type ProfitSummary } from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { ExpensesService } from '../expenses/expenses.service';

const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

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
    const sums = await this.db.client.invoice.aggregate({
      where: { status: 'CONFIRMED', invoiceDate: { gte: asDate(from), lte: asDate(to) } },
      _sum: { payableValue: true, totalCost: true },
      _count: { _all: true },
    });
    const zero = new Prisma.Decimal(0);
    const payable = sums._sum.payableValue ?? zero;
    const cost = sums._sum.totalCost ?? zero;
    const grossProfit = payable.minus(cost);
    return {
      from,
      to,
      invoiceCount: sums._count._all,
      payableValue: payable.toFixed(2),
      productCost: cost.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      expenses: expenses.total,
      netProfit: grossProfit.minus(expenses.total).toFixed(2),
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
      where: { status: 'CONFIRMED', invoiceDate: { gte: asDate(from), lte: asDate(to) } },
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
      sales: (g._sum.payableValue ?? new Prisma.Decimal(0)).toFixed(2),
      invoiceCount: g._count._all,
    }));
  }

  /**
   * Weight sold in [from, to] from the invoice item snapshots of CONFIRMED invoices. Items carry
   * their Total Weight already converted to KG (KG / Gram products) or Liter (Liter / ML). Liters
   * are kept apart — never converted into tons (OQ-7); items without a weight count in neither.
   */
  async weightSold(
    from: string,
    to: string,
  ): Promise<{ kg: string; tons: string; liters: string }> {
    const groups = await this.db.client.invoiceItem.groupBy({
      by: ['totalWeightUnit'],
      where: {
        totalWeightUnit: { not: null },
        invoice: { status: 'CONFIRMED', invoiceDate: { gte: asDate(from), lte: asDate(to) } },
      },
      _sum: { totalWeight: true },
    });
    const sum = (unit: 'KG' | 'LITER') =>
      groups.find((g) => g.totalWeightUnit === unit)?._sum.totalWeight ?? new Prisma.Decimal(0);
    const kg = sum('KG');
    return {
      kg: kg.toFixed(3),
      tons: kg.dividedBy(1000).toFixed(3),
      liters: sum('LITER').toFixed(3),
    };
  }
}
