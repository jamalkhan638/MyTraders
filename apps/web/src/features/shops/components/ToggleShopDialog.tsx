import { type Shop } from '@mytraders/shared-types';
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
import { useUpdateShop } from '../hooks/useShops';

/** Confirmation before activating / deactivating a shop. Shops are never deleted. */
export function ToggleShopDialog({ shop, onClose }: { shop: Shop | null; onClose: () => void }) {
  const update = useUpdateShop();
  const deactivating = shop?.isActive ?? false;

  const confirm = () => {
    if (!shop) return;
    update.mutate(
      { id: shop.id, body: { isActive: !shop.isActive } },
      {
        onSuccess: (updated) =>
          toast.success(`${updated.name} is now ${updated.isActive ? 'active' : 'inactive'}`),
        onError: (error) => showApiError(error),
        onSettled: onClose,
      },
    );
  };

  return (
    <AlertDialog open={shop !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deactivating ? 'Deactivate' : 'Activate'} {shop?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? 'The shop keeps its history, but orders and invoices can no longer be created for it.'
              : 'Orders and invoices can be created for this shop again.'}
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
