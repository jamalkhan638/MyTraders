import { type DashboardSummary } from '@mytraders/shared-types';
import {
  Banknote,
  ClipboardList,
  CreditCard,
  FileText,
  Receipt,
  Scale,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatBusinessDate, formatDateTime } from '@/lib/format/date';
import { formatAmount, formatQuantity } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { useDashboard } from '../api/dashboard.api';
import { SalesChart } from '../components/SalesChart';

/**
 * Admin dashboard (docs/product-requirements.md §4.12, D-34). Every number comes from
 * GET /dashboard/summary, which reuses the orders, ledger, expense and profit logic.
 */
export function DashboardPage() {
  const user = useCurrentUser();
  const dashboard = useDashboard();
  const currency = user.organization?.currency ?? '';
  const month = dashboard.data
    ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${dashboard.data.period.from}T00:00:00Z`),
      )
    : '';

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          month ? `${month} · figures for this month unless stated` : `Welcome back, ${user.name}.`
        }
      />
      {dashboard.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : dashboard.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Could not load the dashboard. Please try again.
          </CardContent>
        </Card>
      ) : (
        <Dashboard data={dashboard.data} currency={currency} />
      )}
    </>
  );
}

function Dashboard({ data, currency }: { data: DashboardSummary; currency: string }) {
  const timeZone = useCurrentUser().organization?.timezone;
  const money = (v: string) => `${currency} ${formatAmount(v)}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          testId="card-pending"
          to="/orders?status=PENDING"
          icon={<ClipboardList />}
          label="Pending orders"
          value={String(data.pendingOrders)}
          note={data.pendingOrders === 0 ? 'Nothing waiting' : 'Waiting for an invoice'}
          highlight={data.pendingOrders > 0}
        />
        <Metric
          testId="card-credit"
          to="/finance/area-ledger"
          icon={<CreditCard />}
          label="Total market credit"
          value={money(data.marketCredit)}
          note={`${data.shopsWithBalance} shop${data.shopsWithBalance === 1 ? '' : 's'} owe · all-time`}
        />
        <Metric
          testId="card-sales"
          to="/invoices"
          icon={<ShoppingCart />}
          label="Sales this month"
          value={money(data.monthlySales)}
          note={`${data.monthlyInvoiceCount} invoice${data.monthlyInvoiceCount === 1 ? '' : 's'} · payable value`}
        />
        <Metric
          testId="card-cash"
          icon={<Banknote />}
          label="Cash collected this month"
          value={money(data.monthlyCashCollected)}
          note="Payments received"
        />
        <Metric
          testId="card-weight"
          icon={<Scale />}
          label="Weight sold this month"
          value={`${formatQuantity(data.monthlyWeightTons)} tons`}
          note={
            <>
              {formatQuantity(data.monthlyWeightKg)} kg
              {data.monthlyVolumeLiters !== '0.000' &&
                ` · plus ${formatQuantity(data.monthlyVolumeLiters)} L (liquids, not in tons)`}
            </>
          }
        />
        <Metric
          testId="card-expenses"
          to="/expenses"
          icon={<Receipt />}
          label="Expenses this month"
          value={money(data.monthlyExpenses)}
          note="Active expenses"
        />
        <Metric
          testId="card-profit"
          icon={<TrendingUp />}
          label="Net profit this month"
          value={money(data.monthlyNetProfit)}
          note={`Gross profit ${formatAmount(data.monthlyGrossProfit)} − expenses`}
          className="sm:col-span-2"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales, last 6 months</CardTitle>
            <CardDescription>Payable value of confirmed invoices ({currency})</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesChart data={data.salesByMonth} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top shops this month</CardTitle>
            <CardDescription>By payable value</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topShops.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sales this month yet.
              </p>
            ) : (
              <ol className="divide-y" data-testid="top-shops">
                {data.topShops.map((row, i) => (
                  <li
                    key={row.shop.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 text-xs text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <Link
                        to={`/shops/${row.shop.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {row.shop.name}
                      </Link>
                    </span>
                    <span className="text-right tabular-nums">
                      {formatAmount(row.sales)}
                      <span className="block text-xs text-muted-foreground">
                        {row.invoiceCount} invoice{row.invoiceCount === 1 ? '' : 's'}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3">
          <CardTitle className="text-base">
            Recent pending orders{' '}
            <span className="font-normal text-muted-foreground">({data.pendingOrders})</span>
          </CardTitle>
          {data.pendingOrders > 0 && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/orders?status=PENDING">View all</Link>
            </Button>
          )}
        </CardHeader>
        {data.recentPendingOrders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No pending orders.</p>
        ) : (
          <>
            <ul className="divide-y md:hidden">
              {data.recentPendingOrders.map((o) => (
                <li key={o.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Link to={`/orders/${o.id}`} className="font-mono font-medium text-primary">
                        {o.orderNumber}
                      </Link>
                      <div className="font-medium">{o.shop.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.area.name} · {o.orderBooker.name} · {o.itemCount} product
                        {o.itemCount === 1 ? '' : 's'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(o.createdAt, timeZone)}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" className="w-full" asChild>
                    <Link to={`/invoices/new?orderId=${o.id}`}>
                      <FileText />
                      Generate invoice
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-sm" data-testid="recent-pending">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b [&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                    <th>Order</th>
                    <th>Shop</th>
                    <th>Area</th>
                    <th>Order booker</th>
                    <th>Date</th>
                    <th className="!text-right">Products</th>
                    <th>
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.recentPendingOrders.map((o) => (
                    <tr key={o.id} className="[&>td]:px-4 [&>td]:py-2.5">
                      <td>
                        <Link
                          to={`/orders/${o.id}`}
                          className="font-mono font-medium text-primary hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="font-medium">{o.shop.name}</td>
                      <td>{o.area.name}</td>
                      <td>{o.orderBooker.name}</td>
                      <td className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(o.createdAt, timeZone)}
                      </td>
                      <td className="text-right tabular-nums">{o.itemCount}</td>
                      <td className="text-right">
                        <Button size="sm" asChild>
                          <Link
                            to={`/invoices/new?orderId=${o.id}`}
                            aria-label={`Generate invoice for ${o.orderNumber}`}
                          >
                            <FileText />
                            Generate invoice
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        Period {formatBusinessDate(data.period.from)} – {formatBusinessDate(data.period.to)} ·
        refreshed every minute
      </p>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
  to,
  highlight,
  className,
  testId,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: ReactNode;
  to?: string;
  highlight?: boolean;
  className?: string;
  testId: string;
}) {
  const body = (
    <CardContent className="space-y-1 px-5">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        <span className={cn('[&_svg]:size-4', highlight && 'text-primary')}>{icon}</span>
      </div>
      <div
        className="text-2xl font-semibold tracking-tight tabular-nums"
        data-testid={`${testId}-value`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{note}</div>
    </CardContent>
  );
  return (
    <Card
      className={cn(
        'py-4',
        to && 'transition-colors hover:border-primary/40',
        highlight && 'border-primary/40',
        className,
      )}
      data-testid={testId}
    >
      {to ? (
        <Link
          to={to}
          className="block rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}
