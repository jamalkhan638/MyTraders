import { ORDER_STATUS_LABELS, OrderStatus } from '@mytraders/shared-types';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge';
import { useInfiniteOrders } from '@/features/orders/hooks/useOrders';
import { formatDateTime } from '@/lib/format/date';
import { cn } from '@/lib/utils';

/** My Orders: only orders I created (the server enforces this). */
export function BookerOrdersPage() {
  const timeZone = useCurrentUser().organization?.timezone;
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const orders = useInfiniteOrders({ pageSize: 20, status: status || undefined });
  const items = orders.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Orders</h1>

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        role="group"
        aria-label="Filter by status"
      >
        {(['', ...Object.values(OrderStatus)] as const).map((value) => (
          <button
            key={value || 'all'}
            type="button"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              'h-9 shrink-0 rounded-full border px-4 text-sm font-medium',
              status === value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {value ? ORDER_STATUS_LABELS[value] : 'All'}
          </button>
        ))}
      </div>

      {orders.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : orders.isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            Could not load your orders.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-7" />
            {status ? 'No orders with this status.' : 'You have not booked any orders yet.'}
            {!status && (
              <Button asChild>
                <Link to="/booker/shops">Go to My Shops</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((order) => (
            <Link key={order.id} to={`/booker/orders/${order.id}`} className="block">
              <Card className="gap-0 py-3 transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center gap-3 px-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{order.orderNumber}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="truncate font-medium">{order.shop.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(order.createdAt, timeZone)} · {order.itemCount} product
                      {order.itemCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
          {orders.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void orders.fetchNextPage()}
              disabled={orders.isFetchingNextPage}
            >
              Load more orders
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
