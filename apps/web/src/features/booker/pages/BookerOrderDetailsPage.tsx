import { type OrderDetails } from '@mytraders/shared-types';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { CancelOrderDialog } from '@/features/orders/components/CancelOrderDialog';
import { OrderItemsList } from '@/features/orders/components/OrderItemsList';
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge';
import { useOrder } from '@/features/orders/hooks/useOrders';
import { ApiError } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format/date';

/** One of my orders. Another booker's order id returns 404 from the server. */
export function BookerOrderDetailsPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const order = useOrder(id);
  const timeZone = useCurrentUser().organization?.timezone;
  const [cancelling, setCancelling] = useState<OrderDetails | null>(null);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/booker/orders">
          <ArrowLeft />
          My Orders
        </Link>
      </Button>

      {order.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : order.isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {order.error instanceof ApiError && order.error.status === 404
              ? 'Order not found.'
              : 'Could not load this order. Please try again.'}
          </CardContent>
        </Card>
      ) : (
        <>
          {params.get('submitted') && order.data.status === 'PENDING' && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground"
            >
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <span>
                Order <strong>{order.data.orderNumber}</strong> was submitted. The office will
                prepare the invoice.
              </span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xl font-semibold">{order.data.orderNumber}</h1>
              <OrderStatusBadge status={order.data.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(order.data.createdAt, timeZone)}
            </p>
          </div>
          <Card className="gap-3 py-4">
            <CardContent className="space-y-1 px-4">
              <div className="text-base font-semibold">{order.data.shop.name}</div>
              <div className="text-sm text-muted-foreground">{order.data.area.name}</div>
              {order.data.notes && <p className="pt-2 text-sm">Note: {order.data.notes}</p>}
            </CardContent>
          </Card>
          <Card className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">
                Products{' '}
                <span className="font-normal text-muted-foreground">({order.data.itemCount})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <OrderItemsList order={order.data} />
            </CardContent>
          </Card>
          {order.data.status === 'PENDING' && (
            <Button
              variant="outline"
              size="lg"
              className="w-full text-destructive"
              onClick={() => setCancelling(order.data)}
            >
              <XCircle />
              Cancel this order
            </Button>
          )}
          <CancelOrderDialog order={cancelling} onClose={() => setCancelling(null)} />
        </>
      )}
    </div>
  );
}
