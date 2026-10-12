import { type InvoiceSummary } from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { showApiError } from '@/lib/api/form-errors';
import { formatAmount } from '@/lib/format/number';
import { useVoidInvoice } from '../hooks/useInvoices';

/**
 * "Delete invoice" (D-42) — a soft delete: the invoice is marked VOIDED with the reason, kept for
 * audit, and its current value is reversed in the shop ledger. Nothing is physically deleted.
 */
export function VoidInvoiceDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: Pick<InvoiceSummary, 'id' | 'invoiceNumber' | 'payableValue'>;
  open: boolean;
  onClose: () => void;
}) {
  const remove = useVoidInvoice();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !remove.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete invoice {invoice.invoiceNumber}?</DialogTitle>
          <DialogDescription>
            The invoice is voided: it stays in the history for audit (marked “Voided / deleted”,
            with its number, lines and edit history) but no longer counts in sales, profit or
            reports. The shop ledger gets a reversal credit of {formatAmount(invoice.payableValue)};
            the original debit stays. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason for deleting (required)</Label>
          <Textarea
            id="void-reason"
            placeholder="e.g. Invoice created for wrong shop"
            rows={3}
            maxLength={300}
            value={reason}
            aria-invalid={!!error}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={remove.isPending}>
            Keep invoice
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (reason.trim().length < 3) {
                setError('Enter the reason for deleting this invoice');
                return;
              }
              remove.mutate(
                { id: invoice.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(`Invoice ${invoice.invoiceNumber} deleted (voided)`);
                    onClose();
                  },
                  onError: (err) => {
                    const detail = err instanceof ApiError ? err.body?.details?.[0] : undefined;
                    if (detail) setError(detail.message);
                    else showApiError(err);
                  },
                },
              );
            }}
          >
            {remove.isPending && <Loader2 className="animate-spin" />}
            Delete invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
