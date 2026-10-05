import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateExpenseInput,
  createExpenseSchema,
  type Expense,
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
import { useExpenseCategories } from '@/features/expense-categories/hooks/useExpenseCategories';
import { showApiError } from '@/lib/api/form-errors';
import { todayIn } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { useCreateExpense, useUpdateExpense } from '../hooks/useExpenses';

export type ExpenseDialogMode = { kind: 'create' } | { kind: 'edit'; expense: Expense };

const FIELDS = ['categoryId', 'amount', 'expenseDate', 'description', 'reference'] as const;

/** Small dialog to add or edit an expense (docs/frontend-guidelines.md §3). */
export function ExpenseFormDialog({
  mode,
  onClose,
}: {
  mode: ExpenseDialogMode | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {mode && (
          <ExpenseForm
            key={mode.kind === 'edit' ? mode.expense.id : 'new'}
            expense={mode.kind === 'edit' ? mode.expense : undefined}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({ expense, onDone }: { expense?: Expense; onDone: () => void }) {
  const user = useCurrentUser();
  const currency = user.organization?.currency ?? '';
  const categories = useExpenseCategories({ status: 'active', pageSize: 100 });
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const pending = create.isPending || update.isPending;
  const form = useForm<CreateExpenseInput>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues: {
      categoryId: expense?.category.id ?? '',
      amount: expense?.amount ?? '',
      expenseDate: expense?.expenseDate ?? todayIn(user.organization?.timezone),
      description: expense?.description ?? '',
      reference: expense?.reference ?? '',
    },
  });
  const { errors, isDirty } = form.formState;
  const err = (field: (typeof FIELDS)[number]) => errors[field]?.message as string | undefined;
  // An expense keeps its category even if it was deactivated later.
  const options = [
    ...(expense && !expense.category.isActive ? [expense.category] : []),
    ...(categories.data?.items ?? []),
  ];

  const onSubmit = form.handleSubmit((values) => {
    const callbacks = {
      onSuccess: () => {
        toast.success(
          expense
            ? 'Expense updated'
            : `Expense of ${currency} ${formatAmount(values.amount)} added`,
        );
        onDone();
      },
      onError: (error: unknown) => showApiError(error, form.setError, FIELDS),
    };
    if (expense) update.mutate({ id: expense.id, body: values }, callbacks);
    else create.mutate(values, callbacks);
  });

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{expense ? 'Edit expense' : 'Add expense'}</DialogTitle>
        <DialogDescription>Business expenses reduce Net Profit.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="categoryId" label="Category" required error={err('categoryId')}>
          <NativeSelect
            id="categoryId"
            aria-invalid={!!errors.categoryId}
            {...form.register('categoryId')}
          >
            <option value="">Choose…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.isActive ? ' (inactive)' : ''}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="amount" label={`Amount (${currency})`} required error={err('amount')}>
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="0.00"
            autoFocus
            aria-invalid={!!errors.amount}
            {...form.register('amount')}
          />
        </FormField>
        <FormField id="expenseDate" label="Date" required error={err('expenseDate')}>
          <Input
            id="expenseDate"
            type="date"
            aria-invalid={!!errors.expenseDate}
            {...form.register('expenseDate')}
          />
        </FormField>
        <FormField id="reference" label="Reference / bill no." error={err('reference')}>
          <Input id="reference" {...form.register('reference')} />
        </FormField>
      </div>
      <FormField id="description" label="Description" error={err('description')}>
        <Textarea id="description" rows={2} maxLength={500} {...form.register('description')} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (expense !== undefined && !isDirty)}>
          {pending && <Loader2 className="animate-spin" />}
          {expense ? 'Save changes' : 'Add expense'}
        </Button>
      </DialogFooter>
    </form>
  );
}
