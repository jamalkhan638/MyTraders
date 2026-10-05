import { ArrowLeft } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { InvoiceForm } from '../components/InvoiceForm';
import { useInvoiceDraft } from '../hooks/useInvoices';

/**
 * Both entry points of the one invoice form:
 * - `/shops/:shopId/invoices/new` — direct invoice for the shop, no rows;
 * - `/invoices/new?orderId=…` — prefilled from a pending order.
 */
export function InvoiceFormPage() {
  const { shopId } = useParams();
  const [params] = useSearchParams();
  const orderId = params.get('orderId') ?? undefined;
  const source = orderId ? { orderId } : { shopId };
  const draft = useInvoiceDraft(source);
  const back = orderId ? `/orders/${orderId}` : shopId ? `/shops/${shopId}` : '/invoices';

  if (!orderId && !shopId) {
    return <Problem back="/shops" message="Open a shop or a pending order to create an invoice." />;
  }
  if (draft.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (draft.isError) {
    const error = draft.error;
    const message =
      error instanceof ApiError && (error.status === 409 || error.status === 404)
        ? error.message
        : 'Could not open the invoice form. Please try again.';
    return <Problem back={back} message={message} />;
  }
  return <InvoiceForm draft={draft.data} />;
}

function Problem({ back, message }: { back: string; message: string }) {
  return (
    <Card className="max-w-xl">
      <CardContent className="flex flex-col items-start gap-4 py-8">
        <p className="text-sm">{message}</p>
        <Button variant="outline" asChild>
          <Link to={back}>
            <ArrowLeft />
            Back
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
