import { type SalesReport } from '@mytraders/shared-types';
import { Link } from 'react-router';
import { useCurrentUser } from '@/features/auth/auth-context';
import { downloadCsv } from '@/lib/export/csv';
import { plural } from '@/lib/format/number';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount, formatQuantity } from '@/lib/format/number';
import { useReport } from '../api/reports.api';
import { describeFilters, optionLabel } from '../components/filter-options';
import { DateRangeFilter, FilterBar, SelectFilter } from '../components/ReportFilters';
import { type ReportColumn, ReportTable } from '../components/ReportTable';
import { ReportView } from '../components/ReportView';
import { useReportLookups, useShopOptions } from '../hooks/useReportLookups';
import { useReportParams } from '../hooks/useReportParams';

type Row = SalesReport['rows'][number];

/** Sales = Payable Value of confirmed invoices (cancelled excluded), with weight sold (D-35). */
export function SalesReportPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const p = useReportParams();
  const lookups = useReportLookups('sales');
  const areaId = p.get('areaId');
  const shops = useShopOptions(areaId || undefined);
  const query = {
    from: p.from,
    to: p.to,
    areaId: p.opt('areaId'),
    shopId: p.opt('shopId'),
    orderBookerId: p.opt('orderBookerId'),
  };
  const report = useReport<SalesReport>('sales', query);
  const data = report.data;
  const summary = describeFilters([
    ['Period', `${formatBusinessDate(p.from)} – ${formatBusinessDate(p.to)}`],
    ['Area', optionLabel(lookups.areas, areaId)],
    ['Shop', optionLabel(shops, p.get('shopId'))],
    ['Order booker', optionLabel(lookups.bookers, p.get('orderBookerId'))],
  ]);

  const columns: ReportColumn<Row>[] = [
    {
      header: 'Date',
      cell: (r) => formatBusinessDate(r.invoiceDate),
      className: 'whitespace-nowrap',
    },
    {
      header: 'Invoice',
      cell: (r) => (
        <Link
          to={`/invoices/${r.invoiceId}`}
          className="font-mono font-medium whitespace-nowrap text-primary hover:underline"
        >
          {r.invoiceNumber}
        </Link>
      ),
      footer: data && plural(data.totals.invoiceCount, 'invoice'),
    },
    { header: 'Shop', cell: (r) => <span className="font-medium">{r.shop.name}</span> },
    { header: 'Area', cell: (r) => r.area.name },
    {
      header: 'Order booker',
      cell: (r) => r.orderBooker?.name ?? <span className="text-muted-foreground">Direct</span>,
    },
    {
      header: `Payable value (${currency})`,
      align: 'right',
      cell: (r) => formatAmount(r.payableValue),
      footer: data && formatAmount(data.totals.payableValue),
    },
    {
      header: 'Weight (kg)',
      align: 'right',
      cell: (r) => formatQuantity(r.weightKg),
      footer:
        data &&
        `${formatQuantity(data.totals.weightKg)} kg · ${formatQuantity(data.totals.weightTons)} t`,
    },
  ];

  const csv = (d: SalesReport) =>
    downloadCsv(`sales-report-${p.from}-${p.to}`, [
      ['Sales report', summary],
      [
        'Date',
        'Invoice number',
        'Shop',
        'Area',
        'Order booker',
        `Payable value (${currency})`,
        'Weight (kg)',
      ],
      ...d.rows.map((r) => [
        r.invoiceDate,
        r.invoiceNumber,
        r.shop.name,
        r.area.name,
        r.orderBooker?.name ?? 'Direct',
        r.payableValue,
        r.weightKg,
      ]),
      [
        'Total',
        `${d.totals.invoiceCount} invoices`,
        '',
        '',
        '',
        d.totals.payableValue,
        d.totals.weightKg,
      ],
      ['Weight (tons)', d.totals.weightTons],
    ]);

  return (
    <ReportView
      title="Sales report"
      description="Payable Value of confirmed invoices — cancelled invoices are excluded. Weight counts liquids at 1 L = 1 kg."
      summary={summary}
      query={report}
      onCsv={data && (() => csv(data))}
      truncated={data?.truncated}
      rowCount={data?.rowCount}
      filters={
        <FilterBar>
          <DateRangeFilter from={p.from} to={p.to} onChange={(r) => p.set(r)} />
          <SelectFilter
            label="Area"
            value={areaId}
            options={lookups.areas}
            onChange={(v) => p.set({ areaId: v, shopId: '' })}
          />
          <SelectFilter
            label="Shop"
            value={p.get('shopId')}
            options={shops}
            onChange={(v) => p.set({ shopId: v })}
          />
          <SelectFilter
            label="Order booker"
            value={p.get('orderBookerId')}
            options={lookups.bookers}
            onChange={(v) => p.set({ orderBookerId: v })}
          />
        </FilterBar>
      }
    >
      {data && (
        <ReportTable
          testId="sales-report"
          columns={columns}
          rows={data.rows}
          rowKey={(r) => r.invoiceId}
          empty="No confirmed invoices in this period."
        />
      )}
    </ReportView>
  );
}
