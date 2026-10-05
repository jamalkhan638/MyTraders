import { type ProfitReport, type ProfitSummary } from '@mytraders/shared-types';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/auth-context';
import { downloadCsv } from '@/lib/export/csv';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { useReport } from '../api/reports.api';
import { describeFilters } from '../components/filter-options';
import { DateRangeFilter, FilterBar } from '../components/ReportFilters';
import { type ReportColumn, ReportTable } from '../components/ReportTable';
import { ReportView } from '../components/ReportView';
import { useReportParams } from '../hooks/useReportParams';

type Month = ProfitReport['byMonth'][number];

const monthName = (month: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );

const negative = (v: string) => v.startsWith('-');

/** Profit = /profit/summary for the period (D-33), also month by month. */
export function ProfitReportPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const p = useReportParams();
  const report = useReport<ProfitReport>('profit', { from: p.from, to: p.to });
  const data = report.data;
  const summary = describeFilters([
    ['Period', `${formatBusinessDate(p.from)} – ${formatBusinessDate(p.to)}`],
  ]);
  const money = (v: string) => (
    <span className={cn(negative(v) && 'text-destructive')}>{formatAmount(v)}</span>
  );

  const figures = (s: ProfitSummary) => [
    {
      label: 'Payable value (sales)',
      value: s.payableValue,
      note: `${s.invoiceCount} confirmed invoices`,
    },
    {
      label: 'Product cost',
      value: s.productCost,
      note: 'Cost snapshots on the invoices',
      sign: '−',
    },
    {
      label: 'Gross profit',
      value: s.grossProfit,
      note: 'Payable value − product cost',
      strong: true,
    },
    { label: 'Expenses', value: s.expenses, note: 'Active expenses only', sign: '−' },
    { label: 'Net profit', value: s.netProfit, note: 'Gross profit − expenses', strong: true },
  ];

  const columns: ReportColumn<Month>[] = [
    { header: 'Month', cell: (m) => monthName(m.month), footer: 'Period total' },
    {
      header: 'Invoices',
      align: 'right',
      cell: (m) => m.invoiceCount,
      footer: data?.summary.invoiceCount,
    },
    {
      header: `Payable value (${currency})`,
      align: 'right',
      cell: (m) => formatAmount(m.payableValue),
      footer: data && formatAmount(data.summary.payableValue),
    },
    {
      header: 'Product cost',
      align: 'right',
      cell: (m) => formatAmount(m.productCost),
      footer: data && formatAmount(data.summary.productCost),
    },
    {
      header: 'Gross profit',
      align: 'right',
      cell: (m) => money(m.grossProfit),
      footer: data && money(data.summary.grossProfit),
    },
    {
      header: 'Expenses',
      align: 'right',
      cell: (m) => formatAmount(m.expenses),
      footer: data && formatAmount(data.summary.expenses),
    },
    {
      header: 'Net profit',
      align: 'right',
      cell: (m) => <span className="font-semibold">{money(m.netProfit)}</span>,
      footer: data && money(data.summary.netProfit),
    },
  ];

  const csv = (d: ProfitReport) =>
    downloadCsv(`profit-report-${p.from}-${p.to}`, [
      ['Profit report', summary],
      [
        'Month',
        'Invoices',
        `Payable value (${currency})`,
        'Product cost',
        'Gross profit',
        'Expenses',
        'Net profit',
      ],
      ...d.byMonth.map((m) => [
        m.month,
        m.invoiceCount,
        m.payableValue,
        m.productCost,
        m.grossProfit,
        m.expenses,
        m.netProfit,
      ]),
      [
        'Period total',
        d.summary.invoiceCount,
        d.summary.payableValue,
        d.summary.productCost,
        d.summary.grossProfit,
        d.summary.expenses,
        d.summary.netProfit,
      ],
    ]);

  return (
    <ReportView
      title="Profit report"
      description="Gross profit = Payable Value − product cost of confirmed invoices; net profit = gross profit − active expenses."
      summary={summary}
      query={report}
      onCsv={data && (() => csv(data))}
      filters={
        <FilterBar>
          <DateRangeFilter from={p.from} to={p.to} onChange={(r) => p.set(r)} />
        </FilterBar>
      }
    >
      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="profit-figures">
            {figures(data.summary).map((f) => (
              <Card key={f.label} className={cn('py-4', f.strong && 'border-primary/40')}>
                <CardContent className="px-4">
                  <div className="text-sm text-muted-foreground">{f.label}</div>
                  <div
                    className={cn(
                      'text-lg font-semibold tabular-nums',
                      negative(f.value) && 'text-destructive',
                    )}
                  >
                    {f.sign && <span className="text-muted-foreground">{f.sign} </span>}
                    {currency} {formatAmount(f.value)}
                  </div>
                  <div className="text-xs text-muted-foreground">{f.note}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          {data.byMonth.length > 0 ? (
            <ReportTable
              testId="profit-report"
              columns={columns}
              rows={data.byMonth}
              rowKey={(m) => m.month}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              The month-by-month table is shown for periods of up to 24 months.
            </p>
          )}
        </div>
      )}
    </ReportView>
  );
}
