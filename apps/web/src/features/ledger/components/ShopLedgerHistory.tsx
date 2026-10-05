import {
  LEDGER_ENTRY_TYPE_LABELS,
  type LedgerEntry,
  PAYMENT_METHOD_LABELS,
} from '@mytraders/shared-types';
import { History } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBusinessDate } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { useShopLedger } from '../hooks/useLedger';

const PAGE_SIZE = 15;

const TYPE_VARIANT = {
  INVOICE: 'secondary',
  PAYMENT: 'default',
  MANUAL_ADJUSTMENT: 'warning',
  INVOICE_REVERSAL: 'destructive',
} as const;

function Reference({ entry }: { entry: LedgerEntry }) {
  if (entry.invoice) {
    return (
      <Link to={`/invoices/${entry.invoice.id}`} className="font-mono text-primary hover:underline">
        {entry.invoice.invoiceNumber}
      </Link>
    );
  }
  if (entry.payment) {
    return (
      <span>
        {PAYMENT_METHOD_LABELS[entry.payment.method]}
        {entry.payment.reference && ` · ${entry.payment.reference}`}
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

/** Shop details → credit history: every ledger entry with the server's running balance. */
export function ShopLedgerHistory({ shopId }: { shopId: string }) {
  const [page, setPage] = useState(1);
  const ledger = useShopLedger(shopId, { page, pageSize: PAGE_SIZE });
  const total = ledger.data?.total ?? 0;

  return (
    <Card className="gap-3 lg:col-span-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4">
          <History />
          Ledger / credit history
          {ledger.data && <span className="font-normal text-muted-foreground">({total})</span>}
        </CardTitle>
        <CardDescription>
          Newest first. The balance column is the shop's balance after each entry.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {ledger.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : ledger.isError ? (
          <p className="text-sm text-destructive">Could not load the ledger.</p>
        ) : ledger.data.items.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No credit history yet.</p>
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th className="!text-right">Debit</th>
                    <th className="!text-right">Credit</th>
                    <th className="!text-right">Balance</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ledger.data.items.map((entry) => (
                    <tr key={entry.id} className="align-top [&>td]:px-2 [&>td]:py-2">
                      <td className="whitespace-nowrap">
                        {formatBusinessDate(entry.transactionDate)}
                      </td>
                      <td>
                        <Badge variant={TYPE_VARIANT[entry.type]}>
                          {entry.type === 'MANUAL_ADJUSTMENT'
                            ? entry.debit !== '0.00'
                              ? 'Adjustment +'
                              : 'Adjustment −'
                            : LEDGER_ENTRY_TYPE_LABELS[entry.type]}
                        </Badge>
                      </td>
                      <td>
                        <Reference entry={entry} />
                      </td>
                      <td className="text-right tabular-nums">
                        {entry.debit !== '0.00' ? formatAmount(entry.debit) : ''}
                      </td>
                      <td className="text-right tabular-nums">
                        {entry.credit !== '0.00' ? formatAmount(entry.credit) : ''}
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {formatAmount(entry.runningBalance)}
                      </td>
                      <td className="max-w-64 text-muted-foreground">
                        {entry.notes ?? ''}
                        <span className="block text-xs">by {entry.createdBy.name}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
