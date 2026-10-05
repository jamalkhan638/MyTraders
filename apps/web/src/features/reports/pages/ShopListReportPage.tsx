import { type ShopListReport } from '@mytraders/shared-types';
import { Link } from 'react-router';
import { useCurrentUser } from '@/features/auth/auth-context';
import { ShopStatusBadge } from '@/features/shops/components/ShopStatusBadge';
import { downloadCsv, slug } from '@/lib/export/csv';
import { formatAmount, plural } from '@/lib/format/number';
import { useReport } from '../api/reports.api';
import { describeFilters, optionLabel } from '../components/filter-options';
import { FilterBar, SearchFilter, SelectFilter } from '../components/ReportFilters';
import { type ReportColumn, ReportTable } from '../components/ReportTable';
import { ReportView } from '../components/ReportView';
import { useReportLookups } from '../hooks/useReportLookups';
import { useReportParams } from '../hooks/useReportParams';

type Row = ShopListReport['rows'][number];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** Area-wise shop list with contact details and the current Shop Ledger balance. */
export function ShopListReportPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const p = useReportParams();
  const lookups = useReportLookups('shops');
  const report = useReport<ShopListReport>('shops', {
    areaId: p.opt('areaId'),
    categoryId: p.opt('categoryId'),
    orderBookerId: p.opt('orderBookerId'),
    q: p.opt('q'),
    status: p.opt('status'),
  });
  const data = report.data;
  const areaName = optionLabel(lookups.areas, p.get('areaId'));
  const summary = describeFilters([
    ['Area', areaName ?? 'All areas'],
    ['Shop category', optionLabel(lookups.categories, p.get('categoryId'))],
    ['Order booker', optionLabel(lookups.bookers, p.get('orderBookerId'))],
    ['Search', p.get('q')],
    ['Status', optionLabel(STATUS_OPTIONS, p.get('status'))],
  ]);

  const columns: ReportColumn<Row>[] = [
    {
      header: 'Shop name',
      cell: (r) => (
        <>
          <Link to={`/shops/${r.shop.id}`} className="font-medium hover:underline">
            {r.shop.name}
          </Link>
          {r.contactPerson && (
            <span className="block text-xs text-muted-foreground">{r.contactPerson}</span>
          )}
        </>
      ),
      footer: data && plural(data.totals.shopCount, 'shop'),
    },
    { header: 'Area', cell: (r) => r.area.name },
    { header: 'Shop category', cell: (r) => r.category?.name ?? '—' },
    { header: 'Order booker', cell: (r) => r.orderBooker?.name ?? '—' },
    { header: 'Phone', cell: (r) => r.phone ?? '—', className: 'whitespace-nowrap' },
    {
      header: `Current outstanding (${currency})`,
      align: 'right',
      cell: (r) => formatAmount(r.outstanding),
      footer: data && formatAmount(data.totals.outstanding),
    },
    { header: 'Status', cell: (r) => <ShopStatusBadge isActive={r.isActive} /> },
  ];

  const csv = (d: ShopListReport) =>
    downloadCsv(`shop-list-${slug(areaName ?? 'all-areas')}`, [
      ['Shop list', summary],
      [
        'Shop name',
        'Area',
        'Shop category',
        'Order booker',
        'Contact person',
        'Phone',
        'Address',
        `Current outstanding (${currency})`,
        'Status',
      ],
      ...d.rows.map((r) => [
        r.shop.name,
        r.area.name,
        r.category?.name ?? '',
        r.orderBooker?.name ?? '',
        r.contactPerson ?? '',
        r.phone ?? '',
        r.address ?? '',
        r.outstanding,
        r.isActive ? 'Active' : 'Inactive',
      ]),
      [
        `Total (${plural(d.totals.shopCount, 'shop')})`,
        '',
        '',
        '',
        '',
        '',
        '',
        d.totals.outstanding,
        '',
      ],
    ]);

  return (
    <ReportView
      title="Shop list"
      description="Area-wise list of shops with their order booker, phone and current outstanding from the Shop Ledger."
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
            label="Shop category"
            value={p.get('categoryId')}
            options={lookups.categories}
            onChange={(v) => p.set({ categoryId: v })}
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
        <ReportTable
          testId="shop-list-report"
          columns={columns}
          rows={data.rows}
          rowKey={(r) => r.shop.id}
          minWidth={880}
          empty="No shops match these filters."
        />
      )}
    </ReportView>
  );
}
