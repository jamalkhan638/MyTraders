import { FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { useInvoices } from '../hooks/useInvoices';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';

const PAGE_SIZE = 10;

/** Shop details → every invoice of the shop (from the invoices' own snapshots). */
export function ShopInvoiceHistory({
  shopId,
  canInvoice,
}: {
  shopId: string;
  canInvoice: boolean;
}) {
  const [page, setPage] = useState(1);
  const invoices = useInvoices({ shopId, page, pageSize: PAGE_SIZE });
  const total = invoices.data?.total ?? 0;

  return (
    <Card className="gap-3 lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4">
          <FileText />
          Invoice history
          {invoices.data && <span className="font-normal text-muted-foreground">({total})</span>}
        </CardTitle>
        {canInvoice && (
          <Button size="sm" asChild>
            <Link to={`/shops/${shopId}/invoices/new`}>
              <Plus />
              Generate invoice
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {invoices.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : invoices.isError ? (
          <p className="text-sm text-destructive">Could not load invoices.</p>
        ) : invoices.data.items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No invoices for this shop yet.</p>
        ) : (
          <>
            <ul className="divide-y">
              {invoices.data.items.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    to={`/invoices/${invoice.id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/50"
                  >
                    <span>
                      <span className="font-mono font-medium text-primary">
                        {invoice.invoiceNumber}
                      </span>
                      <span className="ml-3 text-sm text-muted-foreground">
                        {formatBusinessDate(invoice.invoiceDate)}
                        {invoice.order && ` · order ${invoice.order.orderNumber}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">
                        {formatAmount(invoice.grandTotal)}
                      </span>
                      <InvoiceStatusBadge status={invoice.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2 pt-3 text-sm">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Newer
                </Button>
                <span className="text-muted-foreground">
                  {page} / {Math.ceil(total / PAGE_SIZE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * PAGE_SIZE >= total}
                  onClick={() => setPage(page + 1)}
                >
                  Older
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
