import { zodResolver } from '@hookform/resolvers/zod';
import {
  EXPENSE_CATEGORY_NAME_MAX,
  type ExpenseCategory,
  createExpenseCategorySchema,
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
import { showApiError } from '@/lib/api/form-errors';
import { useCreateExpenseCategory, useUpdateExpenseCategory } from '../hooks/useExpenseCategories';

export type ExpenseCategoryDialogMode =
  { kind: 'create' } | { kind: 'edit'; category: ExpenseCategory };

/** Small dialog to add or rename an expense category (docs/frontend-guidelines.md §3). */
export function ExpenseCategoryFormDialog({
  mode,
  onClose,
}: {
  mode: ExpenseCategoryDialogMode | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {mode && (
          <ExpenseCategoryForm
            key={mode.kind === 'edit' ? mode.category.id : 'new'}
            mode={mode}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseCategoryForm({
  mode,
  onDone,
}: {
  mode: ExpenseCategoryDialogMode;
  onDone: () => void;
}) {
  const editing = mode.kind === 'edit' ? mode.category : null;
  const create = useCreateExpenseCategory();
  const update = useUpdateExpenseCategory();
  const pending = create.isPending || update.isPending;
  const form = useForm({
    resolver: zodResolver(createExpenseCategorySchema),
    defaultValues: { name: editing?.name ?? '' },
  });
  const error = form.formState.errors.name?.message;

  const onSubmit = ({ name }: { name: string }) => {
    const callbacks = {
      onSuccess: () => {
        toast.success(editing ? 'Expense category updated' : `Expense category “${name}” added`);
        onDone();
      },
      onError: (err: unknown) => showApiError(err, form.setError, ['name'], 'name'),
    };
    if (editing) update.mutate({ id: editing.id, body: { name } }, callbacks);
    else create.mutate({ name }, callbacks);
  };

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit expense category' : 'Add expense category'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Rename this expense category.'
            : 'Used to group expenses, e.g. Fuel, Salary or Rent.'}
        </DialogDescription>
      </DialogHeader>
      <FormField id="category-name" label="Category name" required error={error}>
        <Input
          id="category-name"
          autoFocus
          maxLength={EXPENSE_CATEGORY_NAME_MAX + 20}
          placeholder="e.g. Fuel"
          aria-invalid={!!error}
          {...form.register('name')}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (editing !== null && !form.formState.isDirty)}>
          {pending && <Loader2 className="animate-spin" />}
          {editing ? 'Save' : 'Add expense category'}
        </Button>
      </DialogFooter>
    </form>
  );
}
