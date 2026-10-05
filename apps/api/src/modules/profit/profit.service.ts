import { BadRequestException, Injectable } from '@nestjs/common';
import { type ProfitQuery, type ProfitSummary } from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
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
}
