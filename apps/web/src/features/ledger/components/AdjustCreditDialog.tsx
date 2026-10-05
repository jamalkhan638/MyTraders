import { zodResolver } from '@hookform/resolvers/zod';
import { type AdjustCreditInput, adjustCreditSchema } from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/auth-context';
import { showApiError } from '@/lib/api/form-errors';
import { todayIn } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { cn } from '@/lib/utils';
import { useAdjustCredit } from '../hooks/useLedger';
import { type PaymentTarget } from './RecordPaymentDialog';

const FIELDS = ['direction', 'amount', 'adjustmentDate', 'reason'] as const;

/**
 * Adjust Credit (Admin): adds a MANUAL_ADJUSTMENT entry — Increase (debit, e.g. old khata
 * balance) or Decrease (credit) with a reason. A balance is never typed over.
 */
export function AdjustCreditDialog({
  target,
  onClose,
}: {
  target: PaymentTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && <AdjustForm key={target.shopId} target={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({ target, onDone }: { target: PaymentTarget; onDone: () => void }) {
  const user = useCurrentUser();
  const currency = user.organization?.currency ?? '';
  const adjust = useAdjustCredit(target.shopId);
  const form = useForm<AdjustCreditInput>({
    resolver: zodResolver(adjustCreditSchema),
    defaultValues: {
      direction: 'INCREASE',
      amount: '',
      adjustmentDate: todayIn(user.organization?.timezone),
      reason: '',
    },
  });
  const { errors } = form.formState;
  const err = (field: (typeof FIELDS)[number]) => errors[field]?.message as string | undefined;
  const direction = useWatch({ control: form.control, name: 'direction' });

  const onSubmit = form.handleSubmit((values) =>
    adjust.mutate(values, {
      onSuccess: (result) => {
        toast.success(
          `Credit adjusted — ${target.shopName} now owes ${currency} ${formatAmount(result.balance.outstandingBalance)}`,
        );
        onDone();
      },
      onError: (error) => showApiError(error, form.setError, FIELDS),
    }),
  );

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Adjust credit</DialogTitle>
        <DialogDescription>
          {target.shopName} · outstanding{' '}
          <span className="font-semibold text-foreground">
            {currency} {formatAmount(target.outstandingBalance)}
          </span>
          . The adjustment is added to the ledger history with your reason.
        </DialogDescription>
      </DialogHeader>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Adjustment</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {(
            [
              ['INCREASE', 'Increase', 'Shop owes more (debit)'],
              ['DECREASE', 'Decrease', 'Shop owes less (credit)'],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={cn(
                'flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm',
                direction === value && 'border-primary bg-accent',
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" value={value} {...form.register('direction')} />
                {label}
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="adj-amount" label={`Amount (${currency})`} required error={err('amount')}>
          <Input
            id="adj-amount"
            inputMode="decimal"
            placeholder="0.00"
            aria-invalid={!!errors.amount}
            {...form.register('amount')}
          />
        </FormField>
        <FormField id="adjustmentDate" label="Date" required error={err('adjustmentDate')}>
          <Input id="adjustmentDate" type="date" {...form.register('adjustmentDate')} />
        </FormField>
      </div>
      <FormField id="reason" label="Reason" required error={err('reason')}>
        <Textarea
          id="reason"
          rows={2}
          maxLength={500}
          placeholder="e.g. Balance from the old khata"
          aria-invalid={!!errors.reason}
          {...form.register('reason')}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={adjust.isPending}>
          {adjust.isPending && <Loader2 className="animate-spin" />}
          Save adjustment
        </Button>
      </DialogFooter>
    </form>
  );
}
