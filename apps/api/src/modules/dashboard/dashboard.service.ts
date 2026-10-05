import { Injectable } from '@nestjs/common';
import { type DashboardSummary } from '@mytraders/shared-types';
import { ShopLedgerService } from '../ledger/shop-ledger.service';
import { OrdersService } from '../orders/orders.service';
import { ProfitService } from '../profit/profit.service';

/**
 * Admin dashboard (D-34). Only combines existing domain services — every formula lives where it
 * is defined (orders, shop ledger, profit / expenses), so the cards always agree with the rest of
 * the app. Independent queries run in parallel; none of them is per-row (no N+1).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly orders: OrdersService,
    private readonly ledger: ShopLedgerService,
    private readonly profit: ProfitService,
  ) {}

  async summary(): Promise<DashboardSummary> {
    // Current month in the organization timezone; also Sales, Expenses and Profit (D-33).
    const month = await this.profit.summary({});
    const { from, to } = month;
    const [pending, credit, weight, cash, salesByMonth, topShops] = await Promise.all([
      this.orders.list({ page: 1, pageSize: 5, status: 'PENDING' }),
      this.ledger.marketCredit(),
      this.profit.weightSold(from, to),
      this.ledger.cashCollected(from, to),
      this.profit.salesByMonth(to, 6),
      this.profit.topShops(from, to, 5),
    ]);
    return {
      period: { from, to },
      pendingOrders: pending.total,
      marketCredit: credit.marketCredit,
      shopsWithBalance: credit.shopsWithBalance,
      monthlySales: month.payableValue,
      monthlyInvoiceCount: month.invoiceCount,
      monthlyWeightKg: weight.kg,
      monthlyWeightTons: weight.tons,
      monthlyVolumeLiters: weight.liters,
      monthlyExpenses: month.expenses,
      monthlyGrossProfit: month.grossProfit,
      monthlyNetProfit: month.netProfit,
      monthlyCashCollected: cash,
      salesByMonth,
      topShops,
      recentPendingOrders: pending.items,
    };
  }
}
