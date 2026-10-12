import { INVOICE_BATCH_MAX } from '@mytraders/shared-types';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ApiError } from '@/lib/api/client';
import { plural } from '@/lib/format/number';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useInvoiceBatch } from '../hooks/useInvoices';

/**
 * `/invoices/print?ids=a,b,c` — bulk printing (D-41): the selected invoices in the normal invoice
 * template, one per printed page (no blank page at the end), with one print dialog for all.
 */
export function InvoicesPrintPage() {
  const [params] = useSearchParams();
  const ids = useMemo(
    () => (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, INVOICE_BATCH_MAX),
    [params],
  );
  const invoices = useInvoiceBatch(ids);
  const printed = useRef(false);
  const back = `/invoices${params.get('back') ?? ''}`;

  // Open the print dialog once, after every invoice has rendered.
  useEffect(() => {
    if (!invoices.data || printed.current) return;
    printed.current = true;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [invoices.data]);

  if (ids.length === 0 || invoices.isError) {
    const message =
      ids.length === 0
        ? 'No invoices selected. Tick the invoices to print on the invoice list.'
        : invoices.error instanceof ApiError && invoices.error.status === 404
          ? 'One of these invoices does not exist or is not part of your company.'
          : 'Could not load the invoices. Please try again.';
    return (
      <Card className="max-w-xl">
        <CardContent className="flex flex-col items-start gap-4 py-8">
          <p className="text-sm">{message}</p>
          <Button variant="outline" asChild>
            <Link to={back}>
              <ArrowLeft />
              Back to invoices
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={back}>
            <ArrowLeft />
            Invoices
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground" data-testid="print-count">
            {plural(ids.length, 'invoice')} · one per page
          </span>
          <Button onClick={() => window.print()} disabled={!invoices.data}>
            {invoices.data ? <Printer /> : <Loader2 className="animate-spin" />}
            Print all
          </Button>
        </div>
      </div>
      {invoices.data ? (
        <div className="invoice-batch space-y-6 print:space-y-0">
          {invoices.data.map((invoice) => (
            <div key={invoice.id} className="invoice-page">
              <InvoiceDocument invoice={invoice} />
            </div>
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Loading {plural(ids.length, 'invoice')}…
        </p>
      )}
    </div>
  );
}
