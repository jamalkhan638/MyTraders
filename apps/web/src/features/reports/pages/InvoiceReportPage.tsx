import { INVOICE_STATUS_LABELS, type InvoiceReport } from '@mytraders/shared-types';
import { Link } from 'react-router';
import { useCurrentUser } from '@/features/auth/auth-context';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { downloadCsv } from '@/lib/export/csv';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { useReport } from '../api/reports.api';
import { describeFilters, optionLabel } from '../components/filter-options';
import { DateRangeFilter, FilterBar, SelectFilter } from '../components/ReportFilters';
import { type ReportColumn, ReportTable } from '../components/ReportTable';
import { ReportView } from '../components/ReportView';
import { useReportLookups, useShopOptions } from '../hooks/useReportLookups';
import { useReportParams } from '../hooks/useReportParams';

type Row = InvoiceReport['rows'][number];

const STATUS_OPTIONS = [
  { value: 'CONFIRMED', label: INVOICE_STATUS_LABELS.CONFIRMED },
  { value: 'CANCELLED', label: INVOICE_STATUS_LABELS.CANCELLED },
];

const optional = (v: string | null) => (v === null ? '—' : formatAmount(v));
const minus = (v: string) => (v === '0.00' ? '0.00' : `−${formatAmount(v)}`);

/** Every invoice with its invoice-level amounts; totals count confirmed invoices only. */
export function InvoiceReportPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const p = useReportParams();
  const lookups = useReportLookups('sales');
  const areaId = p.get('areaId');
  const shops = useShopOptions(areaId || undefined);
  const report = useReport<InvoiceReport>('invoices', {
    from: p.from,
    to: p.to,
    areaId: p.opt('areaId'),
    shopId: p.opt('shopId'),
    orderBookerId: p.opt('orderBookerId'),
    status: p.opt('status'),
  });
  const data = report.data;
  const summary = describeFilters([
    ['Period', `${formatBusinessDate(p.from)} – ${formatBusinessDate(p.to)}`],
    ['Area (when invoiced)', optionLabel(lookups.areas, areaId)],
    ['Shop', optionLabel(shops, p.get('shopId'))],
    ['Order booker', optionLabel(lookups.bookers, p.get('orderBookerId'))],
    ['Status', optionLabel(STATUS_OPTIONS, p.get('status'))],
  ]);
  const cancelled = (r: Row) => r.status === 'CANCELLED';

  const columns: ReportColumn<Row>[] = [
    {
      header: 'Invoice',
      cell: (r) => (
        <Link
          to={`/invoices/${r.id}`}
          className="font-mono font-medium whitespace-nowrap text-primary hover:underline"
          aria-label={`Open invoice ${r.invoiceNumber}`}
        >
          {r.invoiceNumber}
        </Link>
      ),
      footer: data ? `Confirmed (${data.totals.invoiceCount})` : undefined,
    },
    {
      header: 'Date',
      cell: (r) => formatBusinessDate(r.invoiceDate),
      className: 'whitespace-nowrap',
    },
    { header: 'Shop', cell: (r) => <span className="font-medium">{r.shop.name}</span> },
    {
      header: 'Grand total',
      align: 'right',
      cell: (r) => formatAmount(r.grandTotal),
      footer: data && formatAmount(data.totals.grandTotal),
    },
    {
      header: 'Advance tax',
      align: 'right',
      cell: (r) => optional(r.advanceTax),
      footer: data && formatAmount(data.totals.advanceTax),
    },
    {
      header: 'Further tax',
      align: 'right',
      cell: (r) => optional(r.furtherTax),
      footer: data && formatAmount(data.totals.furtherTax),
    },
    {
      header: 'ADT / special disc.',
      align: 'right',
      cell: (r) => (r.adtDiscount === null ? '—' : minus(r.adtDiscount)),
      footer: data && minus(data.totals.adtDiscount),
    },
    {
      header: `Payable value (${currency})`,
      align: 'right',
      cell: (r) => (
        <span className={cn('font-medium', cancelled(r) && 'text-muted-foreground line-through')}>
          {formatAmount(r.payableValue)}
        </span>
      ),
      footer: data && formatAmount(data.totals.payableValue),
    },
    { header: 'Status', cell: (r) => <InvoiceStatusBadge status={r.status} /> },
  ];

  const csv = (d: InvoiceReport) =>
    downloadCsv(`invoice-report-${p.from}-${p.to}`, [
      ['Invoice report', summary],
      [
        'Invoice number',
        'Date',
        'Shop',
        'Area',
        'Order booker',
        'Grand total',
        'Advance tax',
        'Further tax',
        'ADT / special discount',
        `Payable value (${currency})`,
        'Status',
      ],
      ...d.rows.map((r) => [
        r.invoiceNumber,
        r.invoiceDate,
        r.shop.name,
        r.area.name,
        r.orderBooker?.name ?? 'Direct',
        r.grandTotal,
        r.advanceTax ?? '',
        r.furtherTax ?? '',
        r.adtDiscount ?? '',
        r.payableValue,
        INVOICE_STATUS_LABELS[r.status],
      ]),
      [
        `Total confirmed (${d.totals.invoiceCount})`,
        '',
        '',
        '',
        '',
        d.totals.grandTotal,
        d.totals.advanceTax,
        d.totals.furtherTax,
        d.totals.adtDiscount,
        d.totals.payableValue,
        `${d.cancelledCount} cancelled not counted`,
      ],
    ]);

  return (
    <ReportView
      title="Invoice report"
      description="All invoices with Advance Tax, Further Tax and ADT discount. Totals count confirmed invoices only."
      summary={summary}
      query={report}
      onCsv={data && (() => csv(data))}
      truncated={data?.truncated}
      rowCount={data?.rowCount}
      filters={
        <FilterBar>
          <DateRangeFilter from={p.from} to={p.to} onChange={(r) => p.set(r)} />
          <SelectFilter
            label="Area (when invoiced)"
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
          <SelectFilter
            label="Status"
            value={p.get('status')}
            options={STATUS_OPTIONS}
            onChange={(v) => p.set({ status: v })}
          />
        </FilterBar>
      }
    >
      {data && (
        <>
          <ReportTable
            testId="invoice-report"
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.id}
            minWidth={980}
            empty="No invoices in this period."
          />
          {data.cancelledCount > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {data.cancelledCount} cancelled invoice{data.cancelledCount === 1 ? '' : 's'} listed
              but not counted in the totals.
            </p>
          )}
        </>
      )}
    </ReportView>
  );
}
