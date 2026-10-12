import { type InvoiceDetails } from '@mytraders/shared-types';
import { ArrowLeft, Ban, History, Pencil, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { CancelInvoiceDialog } from '../components/CancelInvoiceDialog';
import { VoidInvoiceDialog } from '../components/VoidInvoiceDialog';
import { InvoiceDocument } from '../components/InvoiceDocument';
import { useInvoice } from '../hooks/useInvoices';

/**
 * Invoice view and print layout (`InvoiceDocument`), with Edit / Cancel / Delete (void) for a
 * confirmed invoice and the invoice's lifecycle history (D-41 / D-42, not printed).
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
  const [dialog, setDialog] = useState<'cancel' | 'void' | null>(null);
  const confirmed = invoice.status === 'CONFIRMED';
  const closedBanner =
    invoice.status === 'VOIDED'
      ? {
          label: 'Deleted',
          at: invoice.voidedAt,
          by: invoice.voidedBy,
          reason: invoice.voidReason,
          note: ' It is kept for your records only: it does not count in sales, profit or reports, and its amount was taken off the shop’s balance.',
        }
      : invoice.status === 'CANCELLED'
        ? {
            label: 'Cancelled',
            at: invoice.cancelledAt,
            by: invoice.cancelledBy,
            reason: invoice.cancelReason,
            note: '',
          }
        : null;

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
          {confirmed && (
            <>
              <Button variant="outline" asChild>
                <Link to={`/invoices/${invoice.id}/edit`}>
                  <Pencil />
                  Edit invoice
                </Link>
              </Button>
              <Button variant="outline" onClick={() => setDialog('cancel')}>
                <Ban />
                Cancel invoice
              </Button>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDialog('void')}
              >
                <Trash2 />
                Delete invoice
              </Button>
            </>
          )}
          <Button onClick={() => window.print()}>
            <Printer />
            Print / save PDF
          </Button>
        </div>
      </div>

      {closedBanner && (
        <div
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive print:hidden"
          role="status"
        >
          <strong>{closedBanner.label}</strong> {formatDateTime(closedBanner.at, timeZone)}
          {closedBanner.by && ` by ${closedBanner.by.name}`} — {closedBanner.reason}.
          {closedBanner.note}
        </div>
      )}

      <InvoiceDocument invoice={invoice} />

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground print:hidden">
        <span>
          Internal (not printed): cost {invoice.currency} {formatAmount(invoice.totalCost)}
        </span>
      </div>

      <InvoiceHistory invoice={invoice} timeZone={timeZone} />

      <CancelInvoiceDialog
        invoice={invoice}
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
      />
      <VoidInvoiceDialog
        invoice={invoice}
        open={dialog === 'void'}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

interface LifecycleEvent {
  key: string;
  action: string;
  tone: 'default' | 'edit' | 'danger';
  at: string;
  by: string;
  reason?: string | null;
  revision?: InvoiceDetails['revisions'][number];
}

/**
 * The invoice's lifecycle, newest first (D-41, D-42): created & confirmed, every edit (with each
 * value before → after), cancelled, deleted (voided) — action, user, date / time and reason.
 */
function InvoiceHistory({ invoice, timeZone }: { invoice: InvoiceDetails; timeZone?: string }) {
  const events: LifecycleEvent[] = [
    {
      key: 'created',
      action: `Created and confirmed (invoice value ${formatAmount(
        invoice.revisions.at(-1)?.previousPayableValue ?? invoice.payableValue,
      )})`,
      tone: 'default',
      at: invoice.createdAt,
      by: invoice.createdBy.name,
    },
    ...invoice.revisions.map((rev): LifecycleEvent => ({
      key: rev.id,
      action: `Edited (edit ${rev.revisionNo}) — invoice value ${formatAmount(
        rev.previousPayableValue,
      )} → ${formatAmount(rev.newPayableValue)}`,
      tone: 'edit',
      at: rev.createdAt,
      by: rev.editedBy.name,
      reason: rev.reason,
      revision: rev,
    })),
  ];
  if (invoice.cancelledAt) {
    events.push({
      key: 'cancelled',
      action: 'Cancelled — amount taken off the shop’s balance',
      tone: 'danger',
      at: invoice.cancelledAt,
      by: invoice.cancelledBy?.name ?? '',
      reason: invoice.cancelReason,
    });
  }
  if (invoice.voidedAt) {
    events.push({
      key: 'voided',
      action: 'Deleted — amount taken off the shop’s balance',
      tone: 'danger',
      at: invoice.voidedAt,
      by: invoice.voidedBy?.name ?? '',
      reason: invoice.voidReason,
    });
  }
  events.sort((x, y) => y.at.localeCompare(x.at));

  return (
    <Card className="mt-6 gap-0 py-0 print:hidden" aria-labelledby="invoice-history">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle id="invoice-history" className="flex items-center gap-2 text-base">
          <History className="size-4" />
          History <span className="font-normal text-muted-foreground">({events.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y px-0">
        {events.map((event) => (
          <section
            key={event.key}
            className="space-y-2 px-4 py-3"
            data-testid={`invoice-event-${event.key === event.revision?.id ? 'edited' : event.key}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span
                className={cn(
                  'font-semibold',
                  event.tone === 'danger' && 'text-destructive',
                  event.tone === 'edit' && 'text-primary',
                )}
              >
                {event.action}
              </span>
              <span className="text-muted-foreground">
                {event.by} · {formatDateTime(event.at, timeZone)}
              </span>
            </div>
            {event.reason && (
              <p className="text-sm">
                <span className="text-muted-foreground">Reason:</span> {event.reason}
              </p>
            )}
            {event.revision && <Changes revision={event.revision} />}
          </section>
        ))}
      </CardContent>
    </Card>
  );
}

/** The values an edit changed, before → after. */
function Changes({ revision }: { revision: InvoiceDetails['revisions'][number] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[420px] text-xs" data-testid="invoice-revision">
        <thead className="text-muted-foreground">
          <tr className="[&>th]:py-1 [&>th]:pr-3 [&>th]:text-left [&>th]:font-medium">
            <th>Changed</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {revision.changes.map((c) => (
            <tr key={c.field} className="[&>td]:py-1 [&>td]:pr-3 [&>td]:align-top">
              <td>{c.label}</td>
              <td className="text-muted-foreground tabular-nums">{display(c.from)}</td>
              <td className="font-medium tabular-nums">{display(c.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Money values ("10289.60") as amounts; quantities, rates, dates and text as they are. */
const display = (value: string) => (/^-?\d+\.\d{2}$/.test(value) ? formatAmount(value) : value);
