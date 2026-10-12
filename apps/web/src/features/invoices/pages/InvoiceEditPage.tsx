import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/client';
import { InvoiceForm } from '../components/InvoiceForm';
import { useInvoiceEditDraft } from '../hooks/useInvoices';

/** `/invoices/:id/edit` — the invoice form opened on a confirmed invoice (D-41, Admin only). */
export function InvoiceEditPage() {
  const { id = '' } = useParams();
  const draft = useInvoiceEditDraft(id);

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
        : 'Could not open the invoice for editing. Please try again.';
    return (
      <Card className="max-w-xl">
        <CardContent className="flex flex-col items-start gap-4 py-8">
          <p className="text-sm">{message}</p>
          <Button variant="outline" asChild>
            <Link to={`/invoices/${id}`}>
              <ArrowLeft />
              Back to the invoice
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <InvoiceForm key={id} draft={draft.data} />;
}
