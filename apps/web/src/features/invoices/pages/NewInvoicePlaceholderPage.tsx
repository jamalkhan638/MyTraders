import { ArrowLeft, Construction } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useOrder } from '@/features/orders/hooks/useOrders';

/**
 * Entry point of the future invoice form (`/invoices/new?orderId=…`). The Invoices module (Phase 4)
 * will replace this page with the real form prefilled from the order. No invoice logic lives here.
 */
export function NewInvoicePlaceholderPage() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const order = useOrder(orderId ?? '');

  return (
    <div className="max-w-2xl">
      <PageHeader title="Generate invoice" />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Construction className="size-8 text-muted-foreground" />
          <p className="font-medium">The invoice form arrives in Phase 4</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {orderId && order.data
              ? `It will open here prefilled with the shop, products and quantities of order ${order.data.orderNumber}.`
              : 'It will open here prefilled from the selected order.'}
          </p>
          {orderId && (
            <Button asChild variant="outline">
              <Link to={`/orders/${orderId}`}>
                <ArrowLeft />
                Back to order
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
