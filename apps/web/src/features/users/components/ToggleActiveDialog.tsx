import { type User } from '@mytraders/shared-types';
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
import { useUpdateOrderBooker } from '../hooks/useUsers';

/** Confirmation before activating / deactivating an Order Booker. */
export function ToggleActiveDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const update = useUpdateOrderBooker();
  const deactivating = user?.isActive ?? false;

  const confirm = () => {
    if (!user) return;
    update.mutate(
      { id: user.id, body: { isActive: !user.isActive } },
      {
        onSuccess: (updated) =>
          toast.success(`${updated.name} is now ${updated.isActive ? 'active' : 'inactive'}`),
        onError: (error) => showApiError(error),
        onSettled: onClose,
      },
    );
  };

  return (
    <AlertDialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deactivating ? 'Deactivate' : 'Activate'} {user?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? 'They will be signed out immediately and will not be able to sign in or book orders until activated again.'
              : 'They will be able to sign in and book orders again.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={deactivating ? buttonVariants({ variant: 'destructive' }) : undefined}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
            disabled={update.isPending}
          >
            {deactivating ? 'Deactivate' : 'Activate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
