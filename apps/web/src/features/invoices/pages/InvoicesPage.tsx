import { type InvoiceSummary, type InvoiceStatus } from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import { FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { DataTable } from '@/components/data-table/DataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge';
import { useInvoices } from '../hooks/useInvoices';

const PAGE_SIZE = 20;

/** All invoices of the company. New invoices start from a shop or a pending order. */
export function InvoicesPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim());
  const invoices = useInvoices({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
  });

  const columns = useMemo<ColumnDef<InvoiceSummary, unknown>[]>(
    () => [
      {
        header: 'Invoice',
        cell: ({ row }) => (
          <Link
            to={`/invoices/${row.original.id}`}
            className="font-mono font-medium text-primary hover:underline"
          >
            {row.original.invoiceNumber}
          </Link>
        ),
      },
      { header: 'Date', cell: ({ row }) => formatBusinessDate(row.original.invoiceDate) },
      {
        header: 'Shop',
        cell: ({ row }) => (
          <Link to={`/shops/${row.original.shop.id}`} className="hover:underline">
            {row.original.shop.name}
          </Link>
        ),
      },
      {
        header: 'Order',
        cell: ({ row }) =>
          row.original.order ? (
            <Link
              to={`/orders/${row.original.order.id}`}
              className="font-mono text-xs hover:underline"
            >
              {row.original.order.orderNumber}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">Direct</span>
          ),
      },
      {
        header: () => <span className="block text-right">Grand total ({currency})</span>,
        id: 'grandTotal',
        cell: ({ row }) => (
          <span className="block text-right font-medium tabular-nums">
            {formatAmount(row.original.grandTotal)}
          </span>
        ),
      },
      { header: 'Status', cell: ({ row }) => <InvoiceStatusBadge status={row.original.status} /> },
    ],
    [currency],
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create an invoice from a shop page (direct) or from a pending order."
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by invoice number or shop"
            aria-label="Search invoices"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <NativeSelect
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as InvoiceStatus | '');
            setPage(1);
          }}
        >
          <option value="">Any status</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </NativeSelect>
      </div>
      <DataTable
        columns={columns}
        data={invoices.data?.items}
        isLoading={invoices.isPending}
        error={invoices.isError ? 'Could not load invoices. Please try again.' : null}
        emptyMessage={
          q || status ? (
            'No invoices match these filters.'
          ) : (
            <span className="flex flex-col items-center gap-2">
              <FileText className="size-6" />
              No invoices yet.
            </span>
          )
        }
        getRowId={(i) => i.id}
        pagination={
          invoices.data
            ? { page, pageSize: PAGE_SIZE, total: invoices.data.total, onPageChange: setPage }
            : undefined
        }
        renderMobileCard={(i) => (
          <Link to={`/invoices/${i.id}`} className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono font-medium">{i.invoiceNumber}</div>
              <div className="text-sm">{i.shop.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatBusinessDate(i.invoiceDate)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular-nums">{formatAmount(i.grandTotal)}</div>
              <InvoiceStatusBadge status={i.status} />
            </div>
          </Link>
        )}
      />
    </>
  );
}
