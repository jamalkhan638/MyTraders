import { type InvoiceDetails } from '@mytraders/shared-types';
import { ArrowLeft, Ban, History, Pencil, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { CancelInvoiceDialog } from '../components/CancelInvoiceDialog';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useInvoice } from '../hooks/useInvoices';

/**
 * Invoice view and print layout (`InvoiceDocument`), with Edit / Cancel for a confirmed invoice
 * and its edit history (D-41, not printed).
 */
export function InvoiceDetailsPage() {
  const { id = '' } = useParams();
  const invoice = useInvoice(id);

  if (invoice.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (invoice.isError) {
    return (
      <Card className="max-w-xl">
        <CardContent className="py-10 text-center text-sm">
          {invoice.error instanceof ApiError && invoice.error.status === 404 ? (
            <span className="text-muted-foreground">
              This invoice does not exist or is not part of your company.
            </span>
          ) : (
            <span className="text-destructive">Could not load this invoice. Please try again.</span>
          )}
        </CardContent>
      </Card>
    );
  }
  return <InvoiceView invoice={invoice.data} />;
}

function InvoiceView({ invoice }: { invoice: InvoiceDetails }) {
  const timeZone = useCurrentUser().organization?.timezone;
  const [cancelling, setCancelling] = useState(false);
  const cancelled = invoice.status === 'CANCELLED';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to={`/shops/${invoice.shop.id}`}>
            <ArrowLeft />
            {invoice.shop.name}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {!cancelled && (
            <>
              <Button variant="outline" asChild>
                <Link to={`/invoices/${invoice.id}/edit`}>
                  <Pencil />
                  Edit invoice
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setCancelling(true)}>
                <Ban />
                Cancel invoice
              </Button>
            </>
          )}
          <Button onClick={() => window.print()}>
            <Printer />
            Print / save PDF
          </Button>
        </div>
      </div>

      {cancelled && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive print:hidden">
          <strong>Cancelled</strong> {formatDateTime(invoice.cancelledAt, timeZone)}
          {invoice.cancelledBy && ` by ${invoice.cancelledBy.name}`} — {invoice.cancelReason}
        </div>
      )}

      <InvoiceDocument invoice={invoice} />

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground print:hidden">
        <span>
          Created by {invoice.createdBy.name} · {formatDateTime(invoice.createdAt, timeZone)}
        </span>
        {invoice.lastEditedAt && (
          <span>
            Last edited by {invoice.lastEditedBy?.name} ·{' '}
            {formatDateTime(invoice.lastEditedAt, timeZone)}
          </span>
        )}
        <span>
          Internal (not printed): cost {invoice.currency} {formatAmount(invoice.totalCost)}
        </span>
      </div>

      {invoice.revisions.length > 0 && <EditHistory invoice={invoice} timeZone={timeZone} />}

      <CancelInvoiceDialog
        invoice={invoice}
        open={cancelling}
        onClose={() => setCancelling(false)}
      />
    </div>
  );
}

/** Every edit of the invoice, newest first: who, when, why, and each value before → after. */
function EditHistory({ invoice, timeZone }: { invoice: InvoiceDetails; timeZone?: string }) {
  return (
    <Card className="mt-6 gap-0 py-0 print:hidden" aria-labelledby="edit-history">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle id="edit-history" className="flex items-center gap-2 text-base">
          <History className="size-4" />
          Edit history{' '}
          <span className="font-normal text-muted-foreground">({invoice.revisions.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y px-0">
        {invoice.revisions.map((rev) => (
          <section key={rev.id} className="space-y-2 px-4 py-3" data-testid="invoice-revision">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm">
                <span className="font-semibold">Edit {rev.revisionNo}</span>{' '}
                <span className="text-muted-foreground">
                  by {rev.editedBy.name} · {formatDateTime(rev.createdAt, timeZone)}
                </span>
              </div>
              <div className="text-sm tabular-nums">
                Invoice value {formatAmount(rev.previousPayableValue)} →{' '}
                <span className="font-semibold">{formatAmount(rev.newPayableValue)}</span>
              </div>
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Reason:</span> {rev.reason}
            </p>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs">
                <thead className="text-muted-foreground">
                  <tr className="[&>th]:py-1 [&>th]:pr-3 [&>th]:text-left [&>th]:font-medium">
                    <th>Changed</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rev.changes.map((c) => (
                    <tr key={c.field} className="[&>td]:py-1 [&>td]:pr-3 [&>td]:align-top">
                      <td>{c.label}</td>
                      <td className="text-muted-foreground tabular-nums">{display(c.from)}</td>
                      <td className="font-medium tabular-nums">{display(c.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

/** Money values ("10289.60") as amounts; quantities, rates, dates and text as they are. */
const display = (value: string) => (/^-?\d+\.\d{2}$/.test(value) ? formatAmount(value) : value);
