import { type DashboardSummary } from '@mytraders/shared-types';
import {
  Banknote,
  ChartColumn,
  CreditCard,
  FileText,
  ReceiptText,
  TrendingUp,
  Weight,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router';
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
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Welcome back,</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.organization?.name ?? user.name}
        </h1>
        {month && (
          <p className="mt-1 text-sm text-muted-foreground">
            {month} · Figures for this month unless stated
          </p>
        )}
      </div>
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
          icon={<FileText />}
          tone="green"
          label="Pending orders"
          value={String(data.pendingOrders)}
          note={data.pendingOrders === 0 ? 'Nothing waiting' : 'Waiting for an invoice'}
          highlight={data.pendingOrders > 0}
        />
        <Metric
          testId="card-credit"
          to="/finance/area-ledger"
          icon={<CreditCard />}
          tone="blue"
          label="Total market credit"
          value={money(data.marketCredit)}
          note={`${data.shopsWithBalance} shop${data.shopsWithBalance === 1 ? '' : 's'} owe · all-time`}
        />
        <Metric
          testId="card-sales"
          to="/invoices"
          icon={<ChartColumn />}
          tone="violet"
          label="Sales this month"
          value={money(data.monthlySales)}
          note={`${data.monthlyInvoiceCount} invoice${data.monthlyInvoiceCount === 1 ? '' : 's'} · payable value`}
        />
        <Metric
          testId="card-cash"
          icon={<Banknote />}
          tone="green"
          label="Cash collected this month"
          value={money(data.monthlyCashCollected)}
          note="Payments received"
        />
        <Metric
          testId="card-weight"
          icon={<Weight />}
          tone="amber"
          label="Weight sold this month"
          value={`${formatQuantity(data.monthlyWeightTons)} tons`}
          note={
            <>
              {formatQuantity(data.monthlyWeightKg)} kg
              {' · liquids counted as 1 L = 1 kg'}
            </>
          }
        />
        <Metric
          testId="card-expenses"
          to="/expenses"
          icon={<ReceiptText />}
          tone="red"
          label="Expenses this month"
          value={money(data.monthlyExpenses)}
          note="Active expenses"
        />
        <Metric
          testId="card-profit"
          icon={<TrendingUp />}
          tone="green"
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

const TONES = {
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
} as const;

function Metric({
  icon,
  tone,
  label,
  value,
  note,
  to,
  highlight,
  className,
  testId,
}: {
  icon: ReactNode;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  note: ReactNode;
  to?: string;
  highlight?: boolean;
  className?: string;
  testId: string;
}) {
  const body = (
    <CardContent className="flex items-start gap-3.5 px-5">
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[22px]',
          TONES[tone],
        )}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className="text-xl font-semibold tracking-tight tabular-nums xl:text-[1.375rem]"
          data-testid={`${testId}-value`}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
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
