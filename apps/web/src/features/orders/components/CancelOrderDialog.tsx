import { type OrderDetails } from '@mytraders/shared-types';
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
import { useCancelOrder } from '../hooks/useOrders';

/** Confirmation before cancelling a pending order. */
export function CancelOrderDialog({
  order,
  onClose,
}: {
  order: OrderDetails | null;
  onClose: () => void;
}) {
  const cancel = useCancelOrder();
  return (
    <AlertDialog open={order !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel order {order?.orderNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            The order stays in the history as cancelled and can no longer be invoiced. This cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep order</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            disabled={cancel.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (!order) return;
              cancel.mutate(order.id, {
                onSuccess: (updated) => toast.success(`Order ${updated.orderNumber} cancelled`),
                onError: (error) => showApiError(error),
                onSettled: onClose,
              });
            }}
          >
            Cancel order
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
