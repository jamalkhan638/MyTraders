import { type InvoiceDetails } from '@mytraders/shared-types';
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
import { useCancelInvoice } from '../hooks/useInvoices';

/** Admin cancels a confirmed invoice with a reason (D-16). Nothing is deleted. */
export function CancelInvoiceDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: InvoiceDetails;
  open: boolean;
  onClose: () => void;
}) {
  const cancel = useCancelInvoice();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !cancel.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel invoice {invoice.invoiceNumber}?</DialogTitle>
          <DialogDescription>
            The invoice stays in the history marked as cancelled, with all its values.
            {invoice.order && ` Order ${invoice.order.orderNumber} stays invoiced.`} This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Textarea
            id="cancel-reason"
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
          <Button variant="outline" onClick={onClose} disabled={cancel.isPending}>
            Keep invoice
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => {
              if (reason.trim().length < 3) {
                setError('Enter the reason for cancelling');
                return;
              }
              cancel.mutate(
                { id: invoice.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(`Invoice ${invoice.invoiceNumber} cancelled`);
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
            {cancel.isPending && <Loader2 className="animate-spin" />}
            Cancel invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
