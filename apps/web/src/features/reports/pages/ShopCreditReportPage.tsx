import { type ShopCreditReport } from '@mytraders/shared-types';
import { Link } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/features/auth/auth-context';
import { downloadCsv } from '@/lib/export/csv';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { useReport } from '../api/reports.api';
import { describeFilters, optionLabel } from '../components/filter-options';
import { FilterBar, SearchFilter, SelectFilter } from '../components/ReportFilters';
import { type ReportColumn, ReportTable } from '../components/ReportTable';
import { ReportView } from '../components/ReportView';
import { useReportLookups } from '../hooks/useReportLookups';
import { useReportParams } from '../hooks/useReportParams';

type Row = ShopCreditReport['rows'][number];

const BALANCE_OPTIONS = [
  { value: 'owing', label: 'Shops that owe' },
  { value: 'all', label: 'All shops' },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** Outstanding Shop Ledger balance per shop (D-30), highest first. */
export function ShopCreditReportPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const p = useReportParams();
  const lookups = useReportLookups('shops');
  const balance = p.get('balance', 'owing');
  const report = useReport<ShopCreditReport>('shop-credit', {
    areaId: p.opt('areaId'),
    orderBookerId: p.opt('orderBookerId'),
    q: p.opt('q'),
    status: p.opt('status'),
    balance,
  });
  const data = report.data;
  const summary = describeFilters([
    ['Shops', optionLabel(BALANCE_OPTIONS, balance)],
    ['Area', optionLabel(lookups.areas, p.get('areaId'))],
    ['Order booker', optionLabel(lookups.bookers, p.get('orderBookerId'))],
    ['Search', p.get('q')],
    ['Status', optionLabel(STATUS_OPTIONS, p.get('status'))],
  ]);

  const columns: ReportColumn<Row>[] = [
    {
      header: 'Shop',
      cell: (r) => (
        <>
          <Link to={`/shops/${r.shop.id}`} className="font-medium hover:underline">
            {r.shop.name}
          </Link>
          {!r.shop.isActive && <span className="ml-1 text-xs text-destructive">(inactive)</span>}
          {r.phone && <span className="block text-xs text-muted-foreground">{r.phone}</span>}
        </>
      ),
      footer: data ? `Total (${data.totals.shopsOwing} owe)` : undefined,
    },
    { header: 'Area', cell: (r) => r.area.name },
    {
      header: 'Order booker',
      cell: (r) => r.orderBooker?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      header: `Current outstanding (${currency})`,
      align: 'right',
      cell: (r) => <span className="font-semibold">{formatAmount(r.outstanding)}</span>,
      footer: data && formatAmount(data.totals.outstanding),
    },
    {
      header: 'Last payment',
      cell: (r) => formatBusinessDate(r.lastPaymentDate),
      className: 'whitespace-nowrap',
    },
    {
      header: 'Last invoice',
      cell: (r) => formatBusinessDate(r.lastInvoiceDate),
      className: 'whitespace-nowrap',
    },
  ];

  const csv = (d: ShopCreditReport) =>
    downloadCsv('shop-credit-report', [
      ['Shop credit report', summary],
      [
        'Shop',
        'Area',
        'Order booker',
        'Phone',
        `Current outstanding (${currency})`,
        'Last payment',
        'Last invoice',
      ],
      ...d.rows.map((r) => [
        r.shop.name,
        r.area.name,
        r.orderBooker?.name ?? '',
        r.phone ?? '',
        r.outstanding,
        r.lastPaymentDate ?? '',
        r.lastInvoiceDate ?? '',
      ]),
      ['Total', '', '', '', d.totals.outstanding, '', ''],
      ['Total market credit (all shops)', '', '', '', d.marketCredit, '', ''],
    ]);

  return (
    <ReportView
      title="Shop credit report"
      description="Current outstanding of each shop from its Shop Ledger, with the last payment and last confirmed invoice."
      summary={summary}
      query={report}
      onCsv={data && (() => csv(data))}
      truncated={data?.truncated}
      rowCount={data?.rowCount}
      filters={
        <FilterBar>
          <SearchFilter
            label="Search"
            placeholder="Shop, contact or phone"
            value={p.get('q')}
            onChange={(v) => p.set({ q: v })}
          />
          <SelectFilter
            label="Area"
            value={p.get('areaId')}
            options={lookups.areas}
            onChange={(v) => p.set({ areaId: v })}
          />
          <SelectFilter
            label="Order booker"
            value={p.get('orderBookerId')}
            options={lookups.bookers}
            onChange={(v) => p.set({ orderBookerId: v })}
          />
          <SelectFilter
            label="Balance"
            value={balance}
            all={null}
            options={BALANCE_OPTIONS}
            onChange={(v) => p.set({ balance: v === 'owing' ? '' : v })}
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
        <div className="space-y-4">
          <Card className="py-4">
            <CardContent className="flex flex-wrap gap-x-10 gap-y-2 px-5">
              <div>
                <div className="text-sm text-muted-foreground">Outstanding of listed shops</div>
                <div className="text-xl font-semibold tabular-nums" data-testid="credit-listed">
                  {currency} {formatAmount(data.totals.outstanding)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total market credit (all shops)</div>
                <div className="text-xl font-semibold tabular-nums" data-testid="credit-market">
                  {currency} {formatAmount(data.marketCredit)}
                </div>
              </div>
            </CardContent>
          </Card>
          <ReportTable
            testId="shop-credit-report"
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.shop.id}
            empty="No shop owes anything with these filters."
          />
        </div>
      )}
    </ReportView>
  );
}
