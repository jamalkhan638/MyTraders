import { type Area } from '@mytraders/shared-types';
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
import { useUpdateArea } from '../hooks/useAreas';

/** Confirmation before activating / deactivating an area. Areas are never deleted. */
export function ToggleAreaDialog({ area, onClose }: { area: Area | null; onClose: () => void }) {
  const update = useUpdateArea();
  const deactivating = area?.isActive ?? false;

  const confirm = () => {
    if (!area) return;
    update.mutate(
      { id: area.id, body: { isActive: !area.isActive } },
      {
        onSuccess: (updated) =>
          toast.success(`${updated.name} is now ${updated.isActive ? 'active' : 'inactive'}`),
        onError: (error) => showApiError(error),
        onSettled: onClose,
      },
    );
  };

  return (
    <AlertDialog open={area !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deactivating ? 'Deactivate' : 'Activate'} {area?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? 'The area stays in your records and history, but it will no longer be offered when adding or assigning shops.'
              : 'The area will be available again when adding or assigning shops.'}
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
