import { type ExpenseCategory } from '@mytraders/shared-types';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { showApiError } from '@/lib/api/form-errors';
import { useUpdateExpenseCategory } from '../hooks/useExpenseCategories';

/** Confirmation before activating / deactivating an expense category. Categories are never deleted. */
export function ToggleExpenseCategoryDialog({
  category,
  onClose,
}: {
  category: ExpenseCategory | null;
  onClose: () => void;
}) {
  const update = useUpdateExpenseCategory();
  const deactivating = category?.isActive ?? false;

  const confirm = () => {
    if (!category) return;
    update.mutate(
      { id: category.id, body: { isActive: !category.isActive } },
      {
        onSuccess: (updated) =>
          toast.success(`${updated.name} is now ${updated.isActive ? 'active' : 'inactive'}`),
        onError: (error) => showApiError(error),
        onSettled: onClose,
      },
    );
  };

  return (
    <AlertDialog open={category !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deactivating ? 'Deactivate' : 'Activate'} {category?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? 'The category stays on existing expenses and in totals, but it will no longer be offered for new expenses.'
              : 'The category will be offered again for new expenses.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={deactivating ? buttonVariants({ variant: 'destructive' }) : undefined}
            disabled={update.isPending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {deactivating ? 'Deactivate' : 'Activate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
