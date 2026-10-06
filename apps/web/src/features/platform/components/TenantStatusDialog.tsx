import { type OrganizationStatus } from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api/client';
import { showApiError } from '@/lib/api/form-errors';
import { useChangeTenantStatus } from '../hooks/usePlatform';

export interface StatusTarget {
  id: string;
  name: string;
  status: OrganizationStatus;
}

/**
 * Confirms activating / reactivating or suspending a tenant. Suspending needs a reason and
 * signs every user of the tenant out at once; nothing in the tenant's data changes.
 */
export function TenantStatusDialog({
  target,
  onClose,
}: {
  target: StatusTarget | null;
  onClose: () => void;
}) {
  const change = useChangeTenantStatus();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const suspending = target?.status !== 'SUSPENDED' && target?.status !== 'TRIAL';
  const verb = !target
    ? ''
    : suspending
      ? 'Suspend'
      : target.status === 'SUSPENDED'
        ? 'Reactivate'
        : 'Activate';

  const close = () => {
    if (change.isPending) return;
    setReason('');
    setError(null);
    onClose();
  };

  const confirm = () => {
    if (!target) return;
    if (suspending && reason.trim().length < 3) {
      setError('Enter the reason for suspending');
      return;
    }
    change.mutate(
      suspending
        ? { id: target.id, action: 'suspend', reason: reason.trim() }
        : { id: target.id, action: 'activate' },
      {
        onSuccess: () => {
          toast.success(`${target.name} ${suspending ? 'suspended' : 'is active'}`);
          setReason('');
          onClose();
        },
        onError: (err) => {
          const detail = err instanceof ApiError ? err.body?.details?.[0] : undefined;
          if (detail) setError(detail.message);
          else showApiError(err);
        },
      },
    );
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {verb} {target?.name}?
          </DialogTitle>
          <DialogDescription>
            {suspending
              ? 'All Admins and Order Bookers of this tenant are signed out and blocked immediately. Their data is kept unchanged and comes back when you reactivate the tenant.'
              : 'The tenant’s users can sign in again and find all their data as it was.'}
          </DialogDescription>
        </DialogHeader>
        {suspending && (
          <div className="space-y-1.5">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              rows={3}
              maxLength={300}
              value={reason}
              aria-invalid={!!error}
              placeholder="e.g. Subscription unpaid since August"
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={change.isPending}>
            Cancel
          </Button>
          <Button
            variant={suspending ? 'destructive' : 'default'}
            disabled={change.isPending}
            onClick={confirm}
          >
            {change.isPending && <Loader2 className="animate-spin" />}
            {verb} tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
