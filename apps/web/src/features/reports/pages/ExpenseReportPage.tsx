import { type ExpenseReport } from '@mytraders/shared-types';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/features/auth/auth-context';
import { useExpenseCategories } from '@/features/expense-categories/hooks/useExpenseCategories';
import { downloadCsv } from '@/lib/export/csv';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { useReport } from '../api/reports.api';
import { describeFilters, optionLabel } from '../components/filter-options';
import {
  DateRangeFilter,
  FilterBar,
  SearchFilter,
  SelectFilter,
} from '../components/ReportFilters';
import { type ReportColumn, ReportTable } from '../components/ReportTable';
import { ReportView } from '../components/ReportView';
import { useReportParams } from '../hooks/useReportParams';

type Row = ExpenseReport['rows'][number];

const STATUS_OPTIONS = [
  { value: 'all', label: 'Active and voided' },
  { value: 'active', label: 'Active' },
  { value: 'voided', label: 'Voided' },
];

/** Expenses by date; voided expenses are listed for reference and never counted (D-32). */
export function ExpenseReportPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const p = useReportParams();
  const categories = (useExpenseCategories({ page: 1, pageSize: 100 }).data?.items ?? []).map(
    (c) => ({ value: c.id, label: c.name }),
  );
  const status = p.get('status', 'all');
  const report = useReport<ExpenseReport>('expenses', {
    from: p.from,
    to: p.to,
    categoryId: p.opt('categoryId'),
    q: p.opt('q'),
    status,
  });
  const data = report.data;
  const summary = describeFilters([
    ['Period', `${formatBusinessDate(p.from)} – ${formatBusinessDate(p.to)}`],
    ['Category', optionLabel(categories, p.get('categoryId'))],
    ['Search', p.get('q')],
    ['Status', optionLabel(STATUS_OPTIONS, status)],
  ]);
  const voided = (r: Row) => r.status === 'VOIDED';

  const columns: ReportColumn<Row>[] = [
    {
      header: 'Date',
      cell: (r) => formatBusinessDate(r.expenseDate),
      className: 'whitespace-nowrap',
      footer: data ? `Active total (${data.totals.activeCount})` : undefined,
    },
    { header: 'Category', cell: (r) => r.category.name },
    {
      header: 'Description',
      cell: (r) => (
        <div className="min-w-40">
          {r.description ?? <span className="text-muted-foreground">—</span>}
          {r.reference && (
            <span className="block text-xs text-muted-foreground">Ref: {r.reference}</span>
          )}
          {r.voidReason && (
            <span className="block text-xs text-destructive">Voided: {r.voidReason}</span>
          )}
        </div>
      ),
    },
    {
      header: `Amount (${currency})`,
      align: 'right',
      cell: (r) => (
        <span className={cn('font-medium', voided(r) && 'text-muted-foreground line-through')}>
          {formatAmount(r.amount)}
        </span>
      ),
      footer: data && formatAmount(data.totals.active),
    },
    {
      header: 'Status',
      cell: (r) =>
        voided(r) ? <Badge variant="destructive">Voided</Badge> : <Badge>Active</Badge>,
    },
  ];

  const csv = (d: ExpenseReport) =>
    downloadCsv(`expense-report-${p.from}-${p.to}`, [
      ['Expense report', summary],
      [
        'Date',
        'Category',
        'Description',
        'Reference',
        `Amount (${currency})`,
        'Status',
        'Void reason',
      ],
      ...d.rows.map((r) => [
        r.expenseDate,
        r.category.name,
        r.description ?? '',
        r.reference ?? '',
        r.amount,
        r.status === 'VOIDED' ? 'Voided' : 'Active',
        r.voidReason ?? '',
      ]),
      ['Active total', '', '', '', d.totals.active, `${d.totals.activeCount} expenses`],
      ['Voided (not counted)', '', '', '', d.totals.voided, `${d.totals.voidedCount} expenses`],
      [],
      ['By category (active)'],
      ...d.byCategory.map((c) => [c.category.name, '', '', '', c.total, `${c.count} expenses`]),
    ]);

  return (
    <ReportView
      title="Expense report"
      description="Expenses by date and category. Voided expenses are shown crossed out and never count in any total."
      summary={summary}
      query={report}
      onCsv={data && (() => csv(data))}
      truncated={data?.truncated}
      rowCount={data?.rowCount}
      filters={
        <FilterBar>
          <DateRangeFilter from={p.from} to={p.to} onChange={(r) => p.set(r)} />
          <SelectFilter
            label="Category"
            value={p.get('categoryId')}
            options={categories}
            onChange={(v) => p.set({ categoryId: v })}
          />
          <SearchFilter
            label="Search"
            placeholder="Description or reference"
            value={p.get('q')}
            onChange={(v) => p.set({ q: v })}
          />
          <SelectFilter
            label="Status"
            value={status}
            all={null}
            options={STATUS_OPTIONS}
            onChange={(v) => p.set({ status: v === 'all' ? '' : v })}
          />
        </FilterBar>
      }
    >
      {data && (
        <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
          <ReportTable
            testId="expense-report"
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.id}
            minWidth={640}
            empty="No expenses in this period."
          />
          <div className="space-y-3 text-sm">
            <div className="rounded-md border bg-card p-4">
              <div className="mb-2 font-medium">By category (active)</div>
              {data.byCategory.length === 0 ? (
                <p className="text-muted-foreground">None</p>
              ) : (
                <ul className="divide-y" data-testid="expense-by-category">
                  {data.byCategory.map((c) => (
                    <li key={c.category.id} className="flex justify-between gap-3 py-1.5">
                      <span>{c.category.name}</span>
                      <span className="tabular-nums">{formatAmount(c.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {data.totals.voidedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Voided: {formatAmount(data.totals.voided)} ({data.totals.voidedCount}) — not
                counted.
              </p>
            )}
          </div>
        </div>
      )}
    </ReportView>
  );
}
