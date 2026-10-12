import { type InvoiceStatus, type InvoiceSummary } from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import {
  Ban,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { DataTable } from '@/components/data-table/DataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NativeSelect } from '@/components/ui/native-select';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatBusinessDate, monthRange, todayIn } from '@/lib/format/date';
import { formatAmount, plural } from '@/lib/format/number';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { CancelInvoiceDialog } from '../components/CancelInvoiceDialog';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge';
import { VoidInvoiceDialog } from '../components/VoidInvoiceDialog';
import { useInvoices } from '../hooks/useInvoices';

const PAGE_SIZE = 20;
const STATUSES = ['CONFIRMED', 'CANCELLED', 'VOIDED'] as const;

/**
 * All invoices of the company (D-41): search, status and invoice-date filters (kept in the URL),
 * row selection for bulk printing, and View / Edit / Print per row. New invoices start from a shop
 * or a pending order.
 */
export function InvoicesPage() {
  const user = useCurrentUser();
  const currency = user.organization?.currency ?? '';
  const today = todayIn(user.organization?.timezone);
  const thisMonth = monthRange(today);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const urlStatus = params.get('status');
  const status: InvoiceStatus | '' = STATUSES.includes(urlStatus as InvoiceStatus)
    ? (urlStatus as InvoiceStatus)
    : '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebouncedValue(search.trim());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [closing, setClosing] = useState<{
    kind: 'cancel' | 'void';
    invoice: InvoiceSummary;
  } | null>(null);
  const onClose = (kind: 'cancel' | 'void') => (invoice: InvoiceSummary) =>
    setClosing({ kind, invoice });

  /**
   * Changes filters in the URL; any filter change goes back to page 1. Starts from the live URL,
   * not this render's params, so quick successive changes never overwrite each other.
   */
  const update = (patch: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // the debounced search box writes to the URL too
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const invalidRange = from !== '' && to !== '' && from > to;
  const invoices = useInvoices({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
    from: (!invalidRange && from) || undefined,
    to: (!invalidRange && to) || undefined,
  });
  const rows = useMemo(() => invoices.data?.items ?? [], [invoices.data]);
  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const filtered = Boolean(q || status || from || to);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** The header box selects / clears only the invoices on the visible page. */
  const togglePage = () =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (allOnPage) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  const printUrl = (ids: string[]) =>
    `/invoices/print?${new URLSearchParams({ ids: ids.join(','), back: params.size ? `?${params}` : '' })}`;

  const columns = useMemo<ColumnDef<InvoiceSummary, unknown>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <SelectBox
            label="Select all invoices on this page"
            checked={allOnPage}
            indeterminate={!allOnPage && someOnPage}
            onChange={togglePage}
          />
        ),
        cell: ({ row }) => (
          <SelectBox
            label={`Select invoice ${row.original.invoiceNumber}`}
            checked={selected.has(row.original.id)}
            onChange={() => toggle(row.original.id)}
          />
        ),
      },
      {
        header: 'Invoice',
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5">
            <Link
              to={`/invoices/${row.original.id}`}
              className="font-mono font-medium text-primary hover:underline"
            >
              {row.original.invoiceNumber}
            </Link>
            {row.original.editCount > 0 && <EditedBadge />}
          </span>
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
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            invoice={row.original}
            printUrl={printUrl}
            onCancel={onClose('cancel')}
            onVoid={onClose('void')}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, selected, allOnPage, someOnPage, rows, params],
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create an invoice from a shop page (direct) or from a pending order."
      />
      <div className="mb-3 grid gap-2 lg:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by invoice number or shop"
            aria-label="Search invoices"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Status"
          value={status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="">Any status</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="VOIDED">Voided / deleted</option>
        </NativeSelect>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="From"
            className="w-[9.5rem]"
            value={from}
            onChange={(e) => update({ from: e.target.value })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            className="w-[9.5rem]"
            value={to}
            onChange={(e) => update({ to: e.target.value })}
          />
          <Button
            variant={from === today && to === today ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => update({ from: today, to: today })}
          >
            Today
          </Button>
          <Button
            variant={from === thisMonth.from && to === thisMonth.to ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => update(thisMonth)}
          >
            This month
          </Button>
          {(from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ from: '', to: '' })}
              aria-label="Clear dates"
            >
              <X />
            </Button>
          )}
        </div>
      </div>
      {invalidRange && (
        <p className="mb-3 text-sm text-destructive">“To” cannot be before “From”.</p>
      )}

      <div
        className={cn(
          'mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm',
          selected.size > 0
            ? 'border-primary/40 bg-primary/5'
            : 'border-dashed text-muted-foreground',
        )}
      >
        <span className="flex items-center gap-3">
          <span className="md:hidden">
            <SelectBox
              label="Select all invoices on this page"
              checked={allOnPage}
              indeterminate={!allOnPage && someOnPage}
              onChange={togglePage}
            />
          </span>
          <span data-testid="selected-count" aria-live="polite">
            {selected.size > 0
              ? `${plural(selected.size, 'invoice')} selected`
              : 'Tick invoices to print several at once'}
          </span>
          {selected.size > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
          )}
        </span>
        <Button
          size="sm"
          disabled={selected.size === 0}
          onClick={() => navigate(printUrl([...selected]))}
        >
          <Printer />
          Print selected
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={invoices.data?.items}
        isLoading={invoices.isPending}
        error={invoices.isError ? 'Could not load invoices. Please try again.' : null}
        emptyMessage={
          filtered ? (
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
            ? {
                page,
                pageSize: PAGE_SIZE,
                total: invoices.data.total,
                onPageChange: (p) => update({ page: p > 1 ? String(p) : '' }, true),
              }
            : undefined
        }
        renderMobileCard={(i) => (
          <div className="flex items-start gap-3">
            <SelectBox
              label={`Select invoice ${i.invoiceNumber}`}
              checked={selected.has(i.id)}
              onChange={() => toggle(i.id)}
            />
            <Link
              to={`/invoices/${i.id}`}
              className="flex min-w-0 flex-1 items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-mono font-medium">
                  {i.invoiceNumber}
                  {i.editCount > 0 && <EditedBadge />}
                </div>
                <div className="truncate text-sm">{i.shop.name}</div>
                <div className="text-xs text-muted-foreground">
                  {formatBusinessDate(i.invoiceDate)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{formatAmount(i.grandTotal)}</div>
                <InvoiceStatusBadge status={i.status} />
              </div>
            </Link>
            <RowActions
              invoice={i}
              printUrl={printUrl}
              onCancel={onClose('cancel')}
              onVoid={onClose('void')}
            />
          </div>
        )}
      />
      {closing && (
        <>
          <CancelInvoiceDialog
            invoice={closing.invoice}
            open={closing.kind === 'cancel'}
            onClose={() => setClosing(null)}
          />
          <VoidInvoiceDialog
            invoice={closing.invoice}
            open={closing.kind === 'void'}
            onClose={() => setClosing(null)}
          />
        </>
      )}
    </>
  );
}

function SelectBox({
  label,
  checked,
  indeterminate = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-4 cursor-pointer accent-primary align-middle"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={onChange}
    />
  );
}

function EditedBadge() {
  return (
    <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
      Edited
    </Badge>
  );
}

/**
 * Row actions menu: View, Edit, Print, Cancel, Delete (void). Edit / Cancel / Delete only for a
 * confirmed invoice; cancelled and voided invoices stay viewable and printable for audit.
 */
function RowActions({
  invoice,
  printUrl,
  onCancel,
  onVoid,
}: {
  invoice: InvoiceSummary;
  printUrl: (ids: string[]) => string;
  onCancel: (invoice: InvoiceSummary) => void;
  onVoid: (invoice: InvoiceSummary) => void;
}) {
  const navigate = useNavigate();
  const confirmed = invoice.status === 'CONFIRMED';
  return (
    <div className="flex justify-end">
      {/* non-modal: a dialog opened from an item must not leave the page unclickable */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${invoice.invoiceNumber}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => navigate(`/invoices/${invoice.id}`)}>
            <Eye />
            View
          </DropdownMenuItem>
          {confirmed && (
            <DropdownMenuItem onSelect={() => navigate(`/invoices/${invoice.id}/edit`)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => navigate(printUrl([invoice.id]))}>
            <Printer />
            Print
          </DropdownMenuItem>
          {confirmed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onCancel(invoice)}>
                <Ban />
                Cancel
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => onVoid(invoice)}>
                <Trash2 />
                Delete (void)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
