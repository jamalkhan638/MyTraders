import { zodResolver } from '@hookform/resolvers/zod';
import { resetTenantAdminPasswordSchema } from '@mytraders/shared-types';
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
import { useResetTenantAdminPassword } from '../hooks/usePlatform';

export interface ResetTarget {
  tenantId: string;
  userId: string;
  name: string;
  email: string;
}

/** Super Admin sets a new password for a tenant Admin (their sessions end). */
export function ResetAdminPasswordDialog({
  target,
  onClose,
}: {
  target: ResetTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && <ResetForm key={target.userId} target={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ResetForm({ target, onDone }: { target: ResetTarget; onDone: () => void }) {
  const reset = useResetTenantAdminPassword();
  const form = useForm({
    resolver: zodResolver(resetTenantAdminPasswordSchema),
    defaultValues: { password: '' },
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(({ password }) =>
        reset.mutate(
          { tenantId: target.tenantId, userId: target.userId, password },
          {
            onSuccess: () => {
              toast.success(`New password set for ${target.email}`);
              onDone();
            },
            onError: (error) => showApiError(error, form.setError, ['password']),
          },
        ),
      )}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>Reset password of {target.name}</DialogTitle>
        <DialogDescription>
          Choose a new password and give it to the Admin ({target.email}). They are signed out of
          every device.
        </DialogDescription>
      </DialogHeader>
      <FormField
        id="new-admin-password"
        label="New password"
        required
        error={form.formState.errors.password?.message}
      >
        <Input
          id="new-admin-password"
          type="password"
          autoComplete="new-password"
          {...form.register('password')}
        />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={reset.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={reset.isPending}>
          {reset.isPending && <Loader2 className="animate-spin" />}
          Set password
        </Button>
      </DialogFooter>
    </form>
  );
}
