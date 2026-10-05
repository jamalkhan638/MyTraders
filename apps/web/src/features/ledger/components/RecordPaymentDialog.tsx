import { zodResolver } from '@hookform/resolvers/zod';
import {
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
  type RecordPaymentInput,
  recordPaymentSchema,
} from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/auth-context';
import { showApiError } from '@/lib/api/form-errors';
import { todayIn } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { useRecordPayment } from '../hooks/useLedger';

const FIELDS = ['amount', 'paymentDate', 'method', 'reference', 'notes'] as const;

export interface PaymentTarget {
  shopId: string;
  shopName: string;
  /** current outstanding balance — a payment may not exceed it */
  outstandingBalance: string;
  /** date to prefill, e.g. the date selected on the area sheet */
  date?: string;
}

/**
 * Record Payment (Admin) — the one payment form, used on Shop Details and on the Area Ledger.
 * Creates a Payment and its PAYMENT ledger credit on the server.
 */
export function RecordPaymentDialog({
  target,
  onClose,
}: {
  target: PaymentTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && <PaymentForm key={target.shopId} target={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ target, onDone }: { target: PaymentTarget; onDone: () => void }) {
  const user = useCurrentUser();
  const currency = user.organization?.currency ?? '';
  const record = useRecordPayment(target.shopId);
  const form = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      amount: '',
      paymentDate: target.date ?? todayIn(user.organization?.timezone),
      method: 'CASH',
      reference: '',
      notes: '',
    },
  });
  const { errors } = form.formState;
  const err = (field: (typeof FIELDS)[number]) => errors[field]?.message as string | undefined;

  const onSubmit = form.handleSubmit((values) =>
    record.mutate(values, {
      onSuccess: (result) => {
        toast.success(
          `Payment recorded — ${target.shopName} now owes ${currency} ${formatAmount(result.balance.outstandingBalance)}`,
        );
        onDone();
      },
      onError: (error) => showApiError(error, form.setError, FIELDS),
    }),
  );

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>
          {target.shopName} · outstanding{' '}
          <span className="font-semibold text-foreground">
            {currency} {formatAmount(target.outstandingBalance)}
          </span>
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="amount" label={`Amount (${currency})`} required error={err('amount')}>
          <Input
            id="amount"
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            aria-invalid={!!errors.amount}
            {...form.register('amount')}
          />
        </FormField>
        <FormField id="paymentDate" label="Payment date" required error={err('paymentDate')}>
          <Input
            id="paymentDate"
            type="date"
            aria-invalid={!!errors.paymentDate}
            {...form.register('paymentDate')}
          />
        </FormField>
        <FormField id="method" label="Method" error={err('method')}>
          <NativeSelect id="method" {...form.register('method')}>
            {Object.values(PaymentMethod).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="reference" label="Reference / receipt no." error={err('reference')}>
          <Input id="reference" {...form.register('reference')} />
        </FormField>
      </div>
      <FormField id="notes" label="Notes" error={err('notes')}>
        <Textarea id="notes" rows={2} maxLength={500} {...form.register('notes')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={record.isPending}>
          {record.isPending && <Loader2 className="animate-spin" />}
          Record payment
        </Button>
      </DialogFooter>
    </form>
  );
}
