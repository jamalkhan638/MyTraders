import { type ShopCategory } from '@mytraders/shared-types';
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
import { useUpdateShopCategory } from '../hooks/useShopCategories';

/** Confirmation before activating / deactivating a shop category. Categories are never deleted. */
export function ToggleShopCategoryDialog({
  category,
  onClose,
}: {
  category: ShopCategory | null;
  onClose: () => void;
}) {
  const update = useUpdateShopCategory();
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
              ? 'The category stays on existing shops and in history, but it will no longer be offered when adding or editing shops.'
              : 'The category will be available again when adding or editing shops.'}
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
