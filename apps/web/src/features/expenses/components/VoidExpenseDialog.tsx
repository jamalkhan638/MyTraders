import { type Expense } from '@mytraders/shared-types';
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
import { showApiError } from '@/lib/api/form-errors';
import { formatAmount } from '@/lib/format/number';
import { useVoidExpense } from '../hooks/useExpenses';

/** Void an expense with a reason. It stays in history (Voided tab) and leaves all totals. */
export function VoidExpenseDialog({
  expense,
  onClose,
}: {
  expense: Expense | null;
  onClose: () => void;
}) {
  const voidExpense = useVoidExpense();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <Dialog
      open={expense !== null}
      onOpenChange={(open) => !open && !voidExpense.isPending && close()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this expense?</DialogTitle>
          <DialogDescription>
            {expense?.category.name} · {formatAmount(expense?.amount)}. It is kept in history but no
            longer counts in any total. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea
            id="void-reason"
            rows={2}
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
          <Button variant="outline" onClick={close} disabled={voidExpense.isPending}>
            Keep expense
          </Button>
          <Button
            variant="destructive"
            disabled={voidExpense.isPending}
            onClick={() => {
              if (!expense) return;
              if (reason.trim().length < 3) {
                setError('Enter the reason');
                return;
              }
              voidExpense.mutate(
                { id: expense.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success('Expense voided');
                    close();
                  },
                  onError: (err) => showApiError(err),
                },
              );
            }}
          >
            {voidExpense.isPending && <Loader2 className="animate-spin" />}
            Void expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
