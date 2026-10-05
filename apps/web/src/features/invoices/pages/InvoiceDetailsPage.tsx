import { type InvoiceDetails, type InvoiceItem } from '@mytraders/shared-types';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api/client';
import { formatBusinessDate, formatDateTime } from '@/lib/format/date';
import { formatAmount, formatQuantity } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { CancelInvoiceDialog } from '../components/CancelInvoiceDialog';
import { InvoiceStatusBadge } from '../components/InvoiceStatusBadge';
import { useInvoice } from '../hooks/useInvoices';

/**
 * Invoice view and print layout (docs/invoice-specification.md §2–4). Everything shown comes from
 * the invoice's own snapshots — never from the current product, shop or company data. The
 * invoice/cost price is internal and never printed.
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
        <div className="flex gap-2">
          {!cancelled && (
            <Button variant="outline" onClick={() => setCancelling(true)}>
              <Ban />
              Cancel invoice
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer />
            Print / save PDF
          </Button>
        </div>
      </div>

      {cancelled && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <strong>Cancelled</strong> {formatDateTime(invoice.cancelledAt, timeZone)}
          {invoice.cancelledBy && ` by ${invoice.cancelledBy.name}`} — {invoice.cancelReason}
        </div>
      )}

      <article
        className="invoice-print relative rounded-lg border bg-card p-6 text-sm shadow-sm print:rounded-none print:border-0 print:p-0 print:text-[10px] print:shadow-none"
        aria-label={`Invoice ${invoice.invoiceNumber}`}
      >
        {cancelled && (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center print:flex">
            <span className="-rotate-12 text-7xl font-bold text-destructive/20">CANCELLED</span>
          </div>
        )}

        <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b pb-4 print:mb-3 print:pb-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight print:text-base">
              {invoice.distributor.name}
            </h1>
            <p className="text-muted-foreground print:text-foreground">Sales Tax Invoice</p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right">
            <dt className="text-muted-foreground">Invoice No.</dt>
            <dd className="font-mono font-semibold">{invoice.invoiceNumber}</dd>
            <dt className="text-muted-foreground">Invoice Date</dt>
            <dd className="font-medium">{formatBusinessDate(invoice.invoiceDate)}</dd>
            {invoice.order && (
              <>
                <dt className="text-muted-foreground">Order</dt>
                <dd>{invoice.order.orderNumber}</dd>
              </>
            )}
            <dt className="text-muted-foreground print:hidden">Status</dt>
            <dd className="print:hidden">
              <InvoiceStatusBadge status={invoice.status} />
            </dd>
          </dl>
        </header>

        <div className="mb-5 grid gap-4 sm:grid-cols-2 print:mb-3 print:grid-cols-2">
          <Party
            title="Shop information"
            rows={[
              ['Name', invoice.shopSnapshot.name],
              ['Address', invoice.shopSnapshot.address],
              ['Contact person', invoice.shopSnapshot.contactPerson],
              ['NTN', invoice.shopSnapshot.ntn],
              ['STRN', invoice.shopSnapshot.strn],
              ['CNIC', invoice.shopSnapshot.cnic],
              ['Channel', invoice.shopSnapshot.category],
            ]}
          />
          <Party
            title="Distributor information"
            rows={[
              ['Name', invoice.distributor.name],
              ['Address', invoice.distributor.address],
              ['Town / city', invoice.distributor.town],
              ['Phone', invoice.distributor.phone],
              ['NTN', invoice.distributor.ntn],
              ['STRN', invoice.distributor.strn],
            ]}
          />
        </div>

        <div className="relative overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[960px] border-collapse text-xs print:min-w-0">
            <thead>
              <tr className="border-y bg-muted/60 text-[11px] text-muted-foreground print:bg-transparent print:text-[9px] print:text-foreground [&>th]:px-1.5 [&>th]:py-1.5 [&>th]:text-right [&>th]:font-semibold">
                <th className="!text-left">Code</th>
                <th className="!text-left">Product</th>
                <th>R.P</th>
                <th>Qty (Ctn)</th>
                <th>Qty (Pcs)</th>
                <th>Total weight</th>
                <th>T.P</th>
                <th>Value excl. tax</th>
                <th>GST</th>
                <th>Value incl. GST</th>
                <th>TO rate</th>
                <th>ATO rate</th>
                <th>Special disc.</th>
                <th>Total trade offer</th>
                <th>Gross value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-y font-semibold [&>td]:px-1.5 [&>td]:py-1.5 [&>td]:text-right [&>td]:tabular-nums">
                <td colSpan={7} className="!text-left">
                  Total
                </td>
                <td>{formatAmount(invoice.totalValueExclTax)}</td>
                <td>{formatAmount(invoice.totalGstAmount)}</td>
                <td>{formatAmount(invoice.totalValueInclGst)}</td>
                <td colSpan={3} />
                <td>{formatAmount(invoice.totalTradeOffer)}</td>
                <td>{formatAmount(invoice.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-5 flex justify-end print:mt-3 print:break-inside-avoid">
          <dl className="w-full max-w-sm space-y-1">
            <Total label={`Grand total (${invoice.currency})`} value={invoice.grandTotal} strong />
            <Total label="Advance tax" value={invoice.advanceTax} />
            <Total label="Further tax" value={invoice.furtherTax} />
            <Total label="ADT / special discount" value={invoice.adtDiscount} negative />
            <Total
              label="Due payment"
              value={
                invoice.duePayment && invoice.duePayment !== '0.00' ? invoice.duePayment : null
              }
            />
            {/* always shown: the final amount of this invoice (and its ledger debit) */}
            <Total
              label={`Payable value (${invoice.currency})`}
              value={invoice.payableValue}
              strong
            />
          </dl>
        </div>
        {invoice.notes && (
          <p className="mt-4 text-xs text-muted-foreground print:hidden">Note: {invoice.notes}</p>
        )}
      </article>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground print:hidden">
        <span>
          Created by {invoice.createdBy.name} · {formatDateTime(invoice.createdAt, timeZone)}
        </span>
        <span>
          Internal (not printed): cost {invoice.currency} {formatAmount(invoice.totalCost)}
        </span>
      </div>

      <CancelInvoiceDialog
        invoice={invoice}
        open={cancelling}
        onClose={() => setCancelling(false)}
      />
    </div>
  );
}

function ItemRow({ item }: { item: InvoiceItem }) {
  const unit = item.totalWeightUnit === 'LITER' ? ' L' : item.totalWeightUnit === 'KG' ? ' kg' : '';
  return (
    <tr className="align-top [&>td]:px-1.5 [&>td]:py-1.5 [&>td]:text-right [&>td]:tabular-nums">
      <td className="!text-left font-mono text-xs print:text-[9px]">{item.productCode ?? '—'}</td>
      <td className="!text-left">{item.productName}</td>
      <td>{formatAmount(item.retailPrice)}</td>
      <td>{item.qtyCtn ?? '—'}</td>
      <td>{item.qtyPcs ?? '—'}</td>
      <td className="whitespace-nowrap">
        {formatQuantity(item.totalWeight)}
        {unit}
      </td>
      <td>{formatAmount(item.tradePrice)}</td>
      <td>{formatAmount(item.valueExclTax)}</td>
      <td className="whitespace-nowrap">
        {formatAmount(item.gstAmount)}
        <span className="block text-[10px] text-muted-foreground print:text-[8px]">
          {formatQuantity(item.gstRate)}%
        </span>
      </td>
      <td>{formatAmount(item.valueInclGst)}</td>
      <td>{formatQuantity(item.toRate)}</td>
      <td>{formatQuantity(item.atoRate)}</td>
      <td>{formatAmount(item.specialDiscount)}</td>
      <td>{formatAmount(item.totalTradeOffer)}</td>
      <td className="font-medium">{formatAmount(item.grossValue)}</td>
    </tr>
  );
}

function Party({ title, rows }: { title: string; rows: [string, string | null][] }) {
  return (
    <section className="rounded-md border p-3 print:p-2">
      <h2 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase print:text-foreground">
        {title}
      </h2>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 print:grid-cols-[5.5rem_1fr]">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <Row key={label} label={label}>
              {value}
            </Row>
          ))}
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </>
  );
}

/** A footer line; optional values that are blank are not shown (nor printed). */
function Total({
  label,
  value,
  strong,
  negative,
}: {
  label: string;
  value: string | null;
  strong?: boolean;
  negative?: boolean;
}) {
  if (value === null) return null;
  return (
    <div
      className={cn(
        'flex justify-between gap-4 border-b py-1 last:border-0',
        strong && 'text-base font-semibold print:text-xs',
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">
        {negative && '− '}
        {formatAmount(value)}
      </dd>
    </div>
  );
}
