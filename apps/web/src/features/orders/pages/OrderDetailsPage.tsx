import { type OrderDetails } from '@mytraders/shared-types';
import { ArrowLeft, FileText, XCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format/date';
import { CancelOrderDialog } from '../components/CancelOrderDialog';
import { OrderItemsList } from '../components/OrderItemsList';
import { OrderStatusBadge } from '../components/OrderStatusBadge';
import { useOrder } from '../hooks/useOrders';

/** Admin order details. The invoice itself is created in the Invoices module (Phase 4). */
export function OrderDetailsPage() {
  const { id = '' } = useParams();
  const order = useOrder(id);

  return (
    <div className="max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link to="/orders">
          <ArrowLeft />
          All orders
        </Link>
      </Button>
      {order.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : order.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {order.error instanceof ApiError && order.error.status === 404
              ? 'This order does not exist or is not part of your company.'
              : 'Could not load this order. Please try again.'}
          </CardContent>
        </Card>
      ) : (
        <Details order={order.data} />
      )}
    </div>
  );
}

function Details({ order }: { order: OrderDetails }) {
  const timeZone = useCurrentUser().organization?.timezone;
  const [cancelling, setCancelling] = useState<OrderDetails | null>(null);
  const pending = order.status === 'PENDING';

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{order.orderNumber}</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Booked {formatDateTime(order.createdAt, timeZone)}
          </p>
        </div>
        {pending && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCancelling(order)}>
              <XCircle />
              Cancel order
            </Button>
            <Button asChild>
              <Link to={`/invoices/new?orderId=${order.id}`}>
                <FileText />
                Generate invoice
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Order</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <Row label="Shop">
                <Link to={`/shops/${order.shop.id}`} className="hover:text-primary hover:underline">
                  {order.shop.name}
                </Link>
              </Row>
              <Row label="Area">{order.area.name}</Row>
              <Row label="Order booker">{order.orderBooker.name}</Row>
              <Row label="Date">{formatDateTime(order.createdAt, timeZone)}</Row>
              <Row label="Note">{order.notes ?? '—'}</Row>
              {order.cancelledAt && (
                <Row label="Cancelled">
                  {formatDateTime(order.cancelledAt, timeZone)}
                  {order.cancelledBy && ` by ${order.cancelledBy.name}`}
                </Row>
              )}
            </dl>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Products{' '}
              <span className="font-normal text-muted-foreground">
                ({order.itemCount} · total qty {order.totalQuantity})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrderItemsList order={order} />
          </CardContent>
        </Card>
      </div>

      <CancelOrderDialog order={cancelling} onClose={() => setCancelling(null)} />
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children}</dd>
    </div>
  );
}
