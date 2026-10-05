import {
  type ListOrdersQueryInput,
  ORDER_STATUS_LABELS,
  OrderStatus,
  type OrderSummary,
} from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import { ClipboardList, Eye, FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DataTable } from '@/components/data-table/DataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useAreas } from '@/features/areas/hooks/useAreas';
import { useCurrentUser } from '@/features/auth/auth-context';
import { useUsers } from '@/features/users/hooks/useUsers';
import { formatDateTime } from '@/lib/format/date';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import { useOrders } from '../hooks/useOrders';

const PAGE_SIZE = 20;
const POLL_MS = 20_000;

/** Admin: all orders of the organization. Pending orders poll every 20 s (docs §4.8). */
export function OrdersPage() {
  const timeZone = useCurrentUser().organization?.timezone;
  const areas = useAreas({ page: 1, pageSize: 100 });
  const bookers = useUsers({ page: 1, pageSize: 100, role: 'ORDER_BOOKER' });
  const [search, setSearch] = useState('');
  const [areaId, setAreaId] = useState('');
  const [orderBookerId, setOrderBookerId] = useState('');
  // ?status=PENDING (e.g. from the Dashboard card) preselects the status filter.
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status');
  const [status, setStatus] = useState<OrderStatus | ''>(
    initialStatus && initialStatus in OrderStatus ? (initialStatus as OrderStatus) : '',
  );
  const [page, setPage] = useState(1);

  const q = useDebouncedValue(search.trim());
  const params: ListOrdersQueryInput = {
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    areaId: areaId || undefined,
    orderBookerId: orderBookerId || undefined,
    status: status || undefined,
  };
  const orders = useOrders(params, POLL_MS);
  const pendingCount = useOrders({ page: 1, pageSize: 1, status: 'PENDING' }, POLL_MS).data?.total;
  const filtered = Boolean(q || areaId || orderBookerId || status);

  const onFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const columns = useMemo<ColumnDef<OrderSummary, unknown>[]>(
    () => [
      {
        header: 'Order #',
        cell: ({ row }) => (
          <Link
            to={`/orders/${row.original.id}`}
            className="font-mono font-medium whitespace-nowrap hover:text-primary hover:underline"
          >
            {row.original.orderNumber}
          </Link>
        ),
      },
      {
        header: 'Shop',
        cell: ({ row }) => <span className="font-medium">{row.original.shop.name}</span>,
      },
      { header: 'Area', cell: ({ row }) => row.original.area.name },
      { header: 'Order booker', cell: ({ row }) => row.original.orderBooker.name },
      {
        header: () => <span className="block text-right">Products</span>,
        id: 'itemCount',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">{row.original.itemCount}</span>
        ),
      },
      {
        header: 'Date',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDateTime(row.original.createdAt, timeZone)}
          </span>
        ),
      },
      { header: 'Status', cell: ({ row }) => <OrderStatusBadge status={row.original.status} /> },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <OrderActions order={row.original} />,
      },
    ],
    [timeZone],
  );

  return (
    <>
      <PageHeader
        title="Orders"
        description="Orders booked by your order bookers. Generate an invoice for each pending order."
        actions={
          pendingCount ? (
            <button
              type="button"
              onClick={() => onFilter((v) => setStatus(v as OrderStatus | ''))('PENDING')}
              className="rounded-md"
            >
              <Badge variant="warning" className="px-3 py-1 text-sm">
                {pendingCount} pending
              </Badge>
            </button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(9rem,auto))]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search order number or shop"
            className="pl-9"
            value={search}
            aria-label="Search orders"
            onChange={(e) => onFilter(setSearch)(e.target.value)}
          />
        </div>
        <NativeSelect
          value={areaId}
          aria-label="Area"
          onChange={(e) => onFilter(setAreaId)(e.target.value)}
        >
          <option value="">All areas</option>
          {areas.data?.items.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={orderBookerId}
          aria-label="Order booker"
          onChange={(e) => onFilter(setOrderBookerId)(e.target.value)}
        >
          <option value="">All order bookers</option>
          {bookers.data?.items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status}
          aria-label="Status"
          onChange={(e) => onFilter((v) => setStatus(v as OrderStatus | ''))(e.target.value)}
        >
          <option value="">Any status</option>
          {Object.values(OrderStatus).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <DataTable
        columns={columns}
        data={orders.data?.items}
        isLoading={orders.isPending}
        error={orders.isError ? 'Could not load orders. Please try again.' : null}
        emptyMessage={
          filtered ? (
            'No orders match these filters.'
          ) : (
            <span className="flex flex-col items-center gap-2">
              <ClipboardList className="size-6" />
              No orders yet. Orders appear here as soon as an order booker submits one.
            </span>
          )
        }
        getRowId={(o) => o.id}
        pagination={
          orders.data
            ? { page, pageSize: PAGE_SIZE, total: orders.data.total, onPageChange: setPage }
            : undefined
        }
        renderMobileCard={(o) => (
          <div
            className={cn(
              'space-y-2',
              o.status === 'PENDING' && '-mx-4 -my-4 bg-warning/5 px-4 py-4',
            )}
          >
            <Link to={`/orders/${o.id}`} className="block space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{o.orderNumber}</span>
                <OrderStatusBadge status={o.status} />
              </div>
              <div className="font-medium">{o.shop.name}</div>
              <div className="text-xs text-muted-foreground">
                {o.area.name} · {o.orderBooker.name} · {o.itemCount} product
                {o.itemCount === 1 ? '' : 's'}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDateTime(o.createdAt, timeZone)}
              </div>
            </Link>
            <OrderActions order={o} />
          </div>
        )}
      />
    </>
  );
}

function OrderActions({ order }: { order: OrderSummary }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {order.status === 'PENDING' && (
        <Button size="sm" asChild>
          <Link to={`/invoices/new?orderId=${order.id}`}>
            <FileText />
            Generate invoice
          </Link>
        </Button>
      )}
      <Button variant="ghost" size="icon" asChild title="View order">
        <Link to={`/orders/${order.id}`} aria-label={`View order ${order.orderNumber}`}>
          <Eye />
        </Link>
      </Button>
    </div>
  );
}
