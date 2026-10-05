import { Injectable } from '@nestjs/common';
import {
  type ExpenseReport,
  type ExpenseReportQuery,
  type InvoiceReport,
  type InvoiceReportQuery,
  type ProductSalesReport,
  type ProductSalesReportQuery,
  PROFIT_REPORT_MAX_MONTHS,
  type ProfitReport,
  type ProfitReportQuery,
  REPORT_ROW_LIMIT,
  type SalesReport,
  type SalesReportQuery,
  type ShopCreditReport,
  type ShopCreditReportQuery,
  type ShopListReport,
  type ShopListReportQuery,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { monthsBetween, resolvePeriod } from '../../common/period/business-period';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ShopLedgerService } from '../ledger/shop-ledger.service';
import { ProfitService } from '../profit/profit.service';
import { invoiceFilters, salesWhere } from '../profit/sales-scope';
import { shopWhere } from '../shops/shops.service';

const Decimal = Prisma.Decimal;
const zero = new Decimal(0);
const money = (value: Prisma.Decimal | null | undefined) => (value ?? zero).toFixed(2);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const sum = (values: string[]) => values.reduce((acc, v) => acc.plus(v), new Decimal(0));
const REF = { select: { id: true, name: true } } as const;

/** What every invoice-based report row needs: the shop, its area and the order's booker. */
const INVOICE_ROW_FIELDS = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  status: true,
  shopId: true,
  /** the shop name as invoiced (snapshot) */
  shopName: true,
  grandTotal: true,
  advanceTax: true,
  furtherTax: true,
  adtDiscount: true,
  payableValue: true,
  shop: { select: { area: REF } },
  order: { select: { orderBooker: REF } },
} as const satisfies Prisma.InvoiceSelect;

type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_ROW_FIELDS }>;

const SHOP_ROW_FIELDS = {
  id: true,
  name: true,
  isActive: true,
  contactPerson: true,
  phone: true,
  address: true,
  area: REF,
  category: REF,
  assignedOrderBooker: REF,
} as const satisfies Prisma.ShopSelect;

/**
 * Reports (docs/product-requirements.md §4.13) — Admin only. This service holds no business
 * formula: it lists rows and asks the owning domain services for every figure —
 * ProfitService (sales = confirmed invoices' Payable Value, cost snapshots, gross / net profit,
 * weight by D-35), ShopLedgerService (outstanding balances, market credit, payments) and
 * ExpensesService (active vs voided expenses). Everything runs through the tenant-scoped client.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly profit: ProfitService,
    private readonly ledger: ShopLedgerService,
    private readonly expenses: ExpensesService,
  ) {}

  /** Sales: each confirmed invoice's Payable Value and weight, with totals. */
  async sales(query: SalesReportQuery): Promise<SalesReport> {
    const period = await this.period(query);
    const filter = { ...query, ...period };
    const where = salesWhere(filter);
    const [rows, sales, weight] = await Promise.all([
      this.invoiceRows(where),
      this.profit.sales(filter),
      this.profit.weightSold(filter),
    ]);
    const weights = await this.profit.weightByInvoice(rows.map((r) => r.id));
    return {
      period,
      rows: rows.map((r) => ({
        invoiceId: r.id,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: isoDate(r.invoiceDate),
        shop: { id: r.shopId, name: r.shopName },
        area: r.shop.area,
        orderBooker: r.order?.orderBooker ?? null,
        payableValue: money(r.payableValue),
        weightKg: weights.get(r.id) ?? '0.000',
      })),
      rowCount: sales.invoiceCount,
      truncated: sales.invoiceCount > rows.length,
      totals: {
        invoiceCount: sales.invoiceCount,
        payableValue: sales.payableValue,
        weightKg: weight.kg,
        weightTons: weight.tons,
      },
    };
  }

  /** Invoices (confirmed and cancelled) with their invoice-level amounts; totals = confirmed only. */
  async invoices(query: InvoiceReportQuery): Promise<InvoiceReport> {
    const period = await this.period(query);
    const filter = { ...query, ...period };
    const where: Prisma.InvoiceWhereInput = {
      ...invoiceFilters(filter),
      ...(query.status ? { status: query.status } : {}),
    };
    // Cancelled invoices are listed (status filter) but never counted in the totals.
    const countsConfirmed = query.status !== 'CANCELLED';
    const [rows, rowCount, cancelledCount, totals] = await Promise.all([
      this.invoiceRows(where),
      this.db.client.invoice.count({ where }),
      query.status === 'CONFIRMED'
        ? 0
        : this.db.client.invoice.count({ where: { ...where, status: 'CANCELLED' } }),
      countsConfirmed
        ? this.db.client.invoice.aggregate({
            where: salesWhere(filter),
            _sum: {
              grandTotal: true,
              advanceTax: true,
              furtherTax: true,
              adtDiscount: true,
              payableValue: true,
            },
            _count: { _all: true },
          })
        : null,
    ]);
    const optional = (v: Prisma.Decimal | null) => (v === null ? null : money(v));
    return {
      period,
      rows: rows.map((r) => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: isoDate(r.invoiceDate),
        status: r.status,
        shop: { id: r.shopId, name: r.shopName },
        area: r.shop.area,
        orderBooker: r.order?.orderBooker ?? null,
        grandTotal: money(r.grandTotal),
        advanceTax: optional(r.advanceTax),
        furtherTax: optional(r.furtherTax),
        adtDiscount: optional(r.adtDiscount),
        payableValue: money(r.payableValue),
      })),
      rowCount,
      truncated: rowCount > rows.length,
      totals: {
        invoiceCount: totals?._count._all ?? 0,
        grandTotal: money(totals?._sum.grandTotal),
        advanceTax: money(totals?._sum.advanceTax),
        furtherTax: money(totals?._sum.furtherTax),
        adtDiscount: money(totals?._sum.adtDiscount),
        payableValue: money(totals?._sum.payableValue),
      },
      cancelledCount,
    };
  }

  /** Shop credit: each shop's Shop Ledger balance, last payment and last invoice. */
  async shopCredit(query: ShopCreditReportQuery): Promise<ShopCreditReport> {
    const where = shopWhere(query);
    const [shops, balances, lastPayments, lastSales, market] = await Promise.all([
      this.db.client.shop.findMany({
        where,
        select: SHOP_ROW_FIELDS,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.ledger.balancesWhere(where),
      this.ledger.lastPaymentDates(where),
      this.profit.lastSaleDates(where),
      this.ledger.marketCredit(),
    ]);
    const all = shops
      .map((s) => ({
        shop: { id: s.id, name: s.name, isActive: s.isActive },
        area: s.area,
        orderBooker: s.assignedOrderBooker,
        phone: s.phone,
        outstanding: balances.get(s.id) ?? '0.00',
        lastPaymentDate: lastPayments.get(s.id) ?? null,
        lastInvoiceDate: lastSales.get(s.id) ?? null,
      }))
      .filter((r) => query.balance === 'all' || new Decimal(r.outstanding).greaterThan(0))
      .sort(
        (a, b) =>
          new Decimal(b.outstanding).comparedTo(a.outstanding) ||
          a.shop.name.localeCompare(b.shop.name),
      );
    return {
      rows: all.slice(0, REPORT_ROW_LIMIT),
      rowCount: all.length,
      truncated: all.length > REPORT_ROW_LIMIT,
      totals: {
        outstanding: money(sum(all.map((r) => r.outstanding))),
        shopsOwing: all.filter((r) => new Decimal(r.outstanding).greaterThan(0)).length,
      },
      marketCredit: market.marketCredit,
    };
  }

  /** Product sales from the invoice item snapshots; TIN in pieces, POUCH in cartons. */
  async productSales(query: ProductSalesReportQuery): Promise<ProductSalesReport> {
    const period = await this.period(query);
    const filter = { ...query, ...period };
    const byProduct = !query.productId && !query.type;
    const [rows, sales] = await Promise.all([
      this.profit.productSales(filter),
      byProduct ? this.profit.sales(filter) : null,
    ]);
    const weightKg = sum(rows.map((r) => r.weightKg));
    const units = (unit: string) =>
      rows.filter((r) => r.quantityUnit === unit).reduce((acc, r) => acc + r.quantity, 0);
    return {
      period,
      rows: rows.slice(0, REPORT_ROW_LIMIT),
      rowCount: rows.length,
      truncated: rows.length > REPORT_ROW_LIMIT,
      totals: {
        pieces: units('PIECE'),
        cartons: units('CARTON'),
        weightKg: weightKg.toFixed(3),
        weightTons: weightKg.dividedBy(1000).toFixed(3),
        salesValue: money(sum(rows.map((r) => r.salesValue))),
        productCost: money(sum(rows.map((r) => r.productCost))),
        profit: money(sum(rows.map((r) => r.profit))),
      },
      invoiceLevel: sales && {
        grandTotal: sales.grandTotal,
        adjustments: money(new Decimal(sales.payableValue).minus(sales.grandTotal)),
        payableValue: sales.payableValue,
        grossProfit: sales.grossProfit,
      },
    };
  }

  /** Expenses of the period; voided ones listed but never in the active total. */
  async expenseReport(query: ExpenseReportQuery): Promise<ExpenseReport> {
    const period = await this.period(query);
    const report = await this.expenses.report({ ...query, ...period }, REPORT_ROW_LIMIT);
    return { period, ...report };
  }

  /** Profit: exactly GET /profit/summary for the period, and for each month in it. */
  async profitReport(query: ProfitReportQuery): Promise<ProfitReport> {
    const period = await this.period(query);
    const months = monthsBetween(period.from, period.to);
    const [summary, byMonth] = await Promise.all([
      this.profit.summary(period),
      months.length > PROFIT_REPORT_MAX_MONTHS
        ? []
        : Promise.all(
            months.map(async (m) => ({
              month: m.month,
              ...(await this.profit.summary({ from: m.from, to: m.to })),
            })),
          ),
    ]);
    return { summary, byMonth };
  }

  /** Shop list / area-wise export: shop details with the current Shop Ledger balance. */
  async shopList(query: ShopListReportQuery): Promise<ShopListReport> {
    const where = shopWhere(query);
    const [shops, rowCount, balances] = await Promise.all([
      this.db.client.shop.findMany({
        where,
        select: SHOP_ROW_FIELDS,
        orderBy: [{ area: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
        take: REPORT_ROW_LIMIT,
      }),
      this.db.client.shop.count({ where }),
      this.ledger.balancesWhere(where),
    ]);
    return {
      rows: shops.map((s) => ({
        shop: { id: s.id, name: s.name },
        area: s.area,
        category: s.category,
        orderBooker: s.assignedOrderBooker,
        contactPerson: s.contactPerson,
        phone: s.phone,
        address: s.address,
        outstanding: balances.get(s.id) ?? '0.00',
        isActive: s.isActive,
      })),
      rowCount,
      truncated: rowCount > shops.length,
      totals: { shopCount: rowCount, outstanding: money(sum([...balances.values()])) },
    };
  }

  private invoiceRows(where: Prisma.InvoiceWhereInput): Promise<InvoiceRow[]> {
    return this.db.client.invoice.findMany({
      where,
      select: INVOICE_ROW_FIELDS,
      orderBy: [{ invoiceDate: 'asc' }, { invoiceNumber: 'asc' }],
      take: REPORT_ROW_LIMIT,
    });
  }

  /** The period of a dated report: given dates, defaulting to the current month (org timezone). */
  private async period(query: { from?: string; to?: string }) {
    return resolvePeriod(await this.ledger.today(), query);
  }
}
