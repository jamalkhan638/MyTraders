import { type Product } from '@mytraders/shared-types';
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
import { useUpdateProduct } from '../hooks/useProducts';

/** Confirmation before activating / deactivating a product. Products are never deleted. */
export function ToggleProductDialog({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const update = useUpdateProduct();
  const deactivating = product?.isActive ?? false;

  const confirm = () => {
    if (!product) return;
    update.mutate(
      { id: product.id, body: { isActive: !product.isActive } },
      {
        onSuccess: (updated) =>
          toast.success(`${updated.name} is now ${updated.isActive ? 'active' : 'inactive'}`),
        onError: (error) => showApiError(error),
        onSettled: onClose,
      },
    );
  };

  return (
    <AlertDialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deactivating ? 'Deactivate' : 'Activate'} {product?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? 'The product stays in your records and past invoices, but it can no longer be ordered or invoiced.'
              : 'The product can be ordered and invoiced again.'}
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
