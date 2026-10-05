import { type ProductSalesReport, QUANTITY_UNIT_LABELS } from '@mytraders/shared-types';
import { useCurrentUser } from '@/features/auth/auth-context';
import { downloadCsv } from '@/lib/export/csv';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount, formatQuantity } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { useReport } from '../api/reports.api';
import { describeFilters, optionLabel } from '../components/filter-options';
import { DateRangeFilter, FilterBar, SelectFilter } from '../components/ReportFilters';
import { type ReportColumn, ReportTable } from '../components/ReportTable';
import { ReportView } from '../components/ReportView';
import { useProductOptions, useReportLookups, useShopOptions } from '../hooks/useReportLookups';
import { useReportParams } from '../hooks/useReportParams';

type Row = ProductSalesReport['rows'][number];

const TYPE_OPTIONS = [
  { value: 'TIN', label: 'TIN (pieces)' },
  { value: 'POUCH', label: 'POUCH (cartons)' },
];

const negative = (v: string) => v.startsWith('-');

/** Product sales from the invoice item snapshots: TIN counted in pieces, POUCH in cartons. */
export function ProductSalesReportPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const p = useReportParams();
  const lookups = useReportLookups('sales');
  const products = useProductOptions();
  const areaId = p.get('areaId');
  const shops = useShopOptions(areaId || undefined);
  const report = useReport<ProductSalesReport>('product-sales', {
    from: p.from,
    to: p.to,
    areaId: p.opt('areaId'),
    shopId: p.opt('shopId'),
    orderBookerId: p.opt('orderBookerId'),
    productId: p.opt('productId'),
    type: p.opt('type'),
  });
  const data = report.data;
  const summary = describeFilters([
    ['Period', `${formatBusinessDate(p.from)} – ${formatBusinessDate(p.to)}`],
    ['Area', optionLabel(lookups.areas, areaId)],
    ['Shop', optionLabel(shops, p.get('shopId'))],
    ['Order booker', optionLabel(lookups.bookers, p.get('orderBookerId'))],
    ['Product', optionLabel(products, p.get('productId'))],
    ['Type', optionLabel(TYPE_OPTIONS, p.get('type'))],
  ]);
  const qty = (r: Row) =>
    `${r.quantity.toLocaleString('en-US')} ${QUANTITY_UNIT_LABELS[r.quantityUnit].toLowerCase()}`;

  const columns: ReportColumn<Row>[] = [
    {
      header: 'Product',
      cell: (r) => (
        <>
          <span className="font-medium">{r.product.name}</span>
          {r.product.code && (
            <span className="block text-xs text-muted-foreground">{r.product.code}</span>
          )}
        </>
      ),
    },
    { header: 'Type', cell: (r) => r.type },
    {
      header: 'Quantity sold',
      align: 'right',
      cell: qty,
      className: 'whitespace-nowrap',
      footer:
        data &&
        `${data.totals.pieces.toLocaleString('en-US')} pcs · ${data.totals.cartons.toLocaleString('en-US')} ctn`,
    },
    {
      header: 'Total weight (kg)',
      align: 'right',
      cell: (r) => formatQuantity(r.weightKg),
      footer: data && formatQuantity(data.totals.weightKg),
    },
    {
      header: `Sales value (${currency})`,
      align: 'right',
      cell: (r) => formatAmount(r.salesValue),
      footer: data && formatAmount(data.totals.salesValue),
    },
    {
      header: 'Product cost',
      align: 'right',
      cell: (r) => formatAmount(r.productCost),
      footer: data && formatAmount(data.totals.productCost),
    },
    {
      header: 'Profit',
      align: 'right',
      cell: (r) => (
        <span className={cn('font-medium', negative(r.profit) && 'text-destructive')}>
          {formatAmount(r.profit)}
        </span>
      ),
      footer: data && formatAmount(data.totals.profit),
    },
  ];

  const csv = (d: ProductSalesReport) =>
    downloadCsv(`product-sales-${p.from}-${p.to}`, [
      ['Product sales report', summary],
      [
        'Product',
        'Code',
        'Type',
        'Quantity sold',
        'Unit',
        'Total weight (kg)',
        `Sales value (${currency})`,
        'Product cost',
        'Profit',
      ],
      ...d.rows.map((r) => [
        r.product.name,
        r.product.code ?? '',
        r.type,
        r.quantity,
        QUANTITY_UNIT_LABELS[r.quantityUnit],
        r.weightKg,
        r.salesValue,
        r.productCost,
        r.profit,
      ]),
      [
        'Total',
        '',
        '',
        `${d.totals.pieces} pcs / ${d.totals.cartons} ctn`,
        '',
        d.totals.weightKg,
        d.totals.salesValue,
        d.totals.productCost,
        d.totals.profit,
      ],
      ...(d.invoiceLevel
        ? [
            [
              'Invoice-level advance tax + further tax − ADT discount',
              '',
              '',
              '',
              '',
              '',
              d.invoiceLevel.adjustments,
            ],
            [
              'Payable value',
              '',
              '',
              '',
              '',
              '',
              d.invoiceLevel.payableValue,
              d.totals.productCost,
              d.invoiceLevel.grossProfit,
            ],
          ]
        : []),
    ]);

  return (
    <ReportView
      title="Product sales report"
      description="From confirmed invoice lines: TIN quantity in pieces, POUCH in cartons. Sales value = line gross value; cost = cost snapshot."
      summary={summary}
      query={report}
      onCsv={data && (() => csv(data))}
      truncated={data?.truncated}
      rowCount={data?.rowCount}
      filters={
        <FilterBar>
          <DateRangeFilter from={p.from} to={p.to} onChange={(r) => p.set(r)} />
          <SelectFilter
            label="Product"
            value={p.get('productId')}
            options={products}
            onChange={(v) => p.set({ productId: v })}
          />
          <SelectFilter
            label="Type"
            value={p.get('type')}
            options={TYPE_OPTIONS}
            onChange={(v) => p.set({ type: v })}
          />
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
        <>
          <ReportTable
            testId="product-sales-report"
            columns={columns}
            rows={data.rows}
            rowKey={(r) => `${r.product.id}:${r.type}`}
            minWidth={900}
            empty="No products sold in this period."
          />
          {data.invoiceLevel && (
            <div
              className="mt-3 rounded-md border bg-card px-4 py-3 text-sm"
              data-testid="product-reconciliation"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-muted-foreground">
                  Invoice-level Advance Tax + Further Tax − ADT discount (not split by product)
                </span>
                <span className="tabular-nums">{formatAmount(data.invoiceLevel.adjustments)}</span>
              </div>
              <div className="mt-1 flex flex-wrap justify-between gap-2 font-medium">
                <span>
                  Payable value {formatAmount(data.invoiceLevel.payableValue)} − product cost ={' '}
                  gross profit
                </span>
                <span className="tabular-nums">{formatAmount(data.invoiceLevel.grossProfit)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </ReportView>
  );
}
