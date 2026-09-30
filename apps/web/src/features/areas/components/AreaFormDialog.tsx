import { zodResolver } from '@hookform/resolvers/zod';
import { AREA_NAME_MAX, type Area, createAreaSchema } from '@mytraders/shared-types';
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
import { useCreateArea, useUpdateArea } from '../hooks/useAreas';

export type AreaDialogMode = { kind: 'create' } | { kind: 'edit'; area: Area };

/** Small dialog to add or rename an area (docs/frontend-guidelines.md §3). */
export function AreaFormDialog({
  mode,
  onClose,
}: {
  mode: AreaDialogMode | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {mode && (
          <AreaForm
            key={mode.kind === 'edit' ? mode.area.id : 'new'}
            mode={mode}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AreaForm({ mode, onDone }: { mode: AreaDialogMode; onDone: () => void }) {
  const editing = mode.kind === 'edit' ? mode.area : null;
  const create = useCreateArea();
  const update = useUpdateArea();
  const pending = create.isPending || update.isPending;
  const form = useForm({
    resolver: zodResolver(createAreaSchema),
    defaultValues: { name: editing?.name ?? '' },
  });
  const error = form.formState.errors.name?.message;

  const onSubmit = ({ name }: { name: string }) => {
    const callbacks = {
      onSuccess: () => {
        toast.success(editing ? 'Area updated' : `Area “${name}” added`);
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
        <DialogTitle>{editing ? 'Edit area' : 'Add area'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Rename this market area.'
            : 'Market areas group your shops, e.g. Saddar or University Road.'}
        </DialogDescription>
      </DialogHeader>
      <FormField id="area-name" label="Area name" required error={error}>
        <Input
          id="area-name"
          autoFocus
          maxLength={AREA_NAME_MAX + 20}
          placeholder="e.g. Saddar"
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
          {editing ? 'Save' : 'Add area'}
        </Button>
      </DialogFooter>
    </form>
  );
}
