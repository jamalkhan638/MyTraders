import { zodResolver } from '@hookform/resolvers/zod';
import {
  SHOP_CATEGORY_NAME_MAX,
  type ShopCategory,
  createShopCategorySchema,
} from '@mytraders/shared-types';
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
import { useCreateShopCategory, useUpdateShopCategory } from '../hooks/useShopCategories';

export type ShopCategoryDialogMode = { kind: 'create' } | { kind: 'edit'; category: ShopCategory };

/** Small dialog to add or rename a shop category (docs/frontend-guidelines.md §3). */
export function ShopCategoryFormDialog({
  mode,
  onClose,
}: {
  mode: ShopCategoryDialogMode | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {mode && (
          <ShopCategoryForm
            key={mode.kind === 'edit' ? mode.category.id : 'new'}
            mode={mode}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShopCategoryForm({ mode, onDone }: { mode: ShopCategoryDialogMode; onDone: () => void }) {
  const editing = mode.kind === 'edit' ? mode.category : null;
  const create = useCreateShopCategory();
  const update = useUpdateShopCategory();
  const pending = create.isPending || update.isPending;
  const form = useForm({
    resolver: zodResolver(createShopCategorySchema),
    defaultValues: { name: editing?.name ?? '' },
  });
  const error = form.formState.errors.name?.message;

  const onSubmit = ({ name }: { name: string }) => {
    const callbacks = {
      onSuccess: () => {
        toast.success(editing ? 'Shop category updated' : `Shop category “${name}” added`);
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
        <DialogTitle>{editing ? 'Edit shop category' : 'Add shop category'}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Rename this shop category.'
            : 'Shop types used to group shops, e.g. Convenience Store or Wholesale.'}
        </DialogDescription>
      </DialogHeader>
      <FormField id="category-name" label="Category name" required error={error}>
        <Input
          id="category-name"
          autoFocus
          maxLength={SHOP_CATEGORY_NAME_MAX + 20}
          placeholder="e.g. Convenience Store"
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
          {editing ? 'Save' : 'Add shop category'}
        </Button>
      </DialogFooter>
    </form>
  );
}
