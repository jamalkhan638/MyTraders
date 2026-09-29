import { zodResolver } from '@hookform/resolvers/zod';
import {
  createOrderBookerSchema,
  passwordSchema,
  updateOrderBookerSchema,
  type User,
} from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { showApiError } from '@/lib/api/form-errors';
import { useCreateOrderBooker, useUpdateOrderBooker } from '../hooks/useUsers';

const FIELDS = ['name', 'email', 'phone', 'password'] as const;

/** Edit form: an empty password means "keep the current password". */
const editFormSchema = updateOrderBookerSchema.extend({
  password: z.union([z.literal(''), passwordSchema]).optional(),
});

type Mode = { kind: 'create' } | { kind: 'edit'; user: User };

/** Right-side drawer to add or edit an Order Booker (docs/frontend-guidelines.md §3). */
export function OrderBookerFormSheet({
  mode,
  onClose,
}: {
  mode: Mode | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {mode?.kind === 'create' && <CreateForm onDone={onClose} />}
        {mode?.kind === 'edit' && <EditForm key={mode.user.id} user={mode.user} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const create = useCreateOrderBooker();
  const form = useForm({
    resolver: zodResolver(createOrderBookerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '' },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex h-full flex-col"
      onSubmit={form.handleSubmit((values) =>
        create.mutate(values, {
          onSuccess: (user) => {
            toast.success(`${user.name} can now sign in with ${user.email}`);
            onDone();
          },
          onError: (error) => showApiError(error, form.setError, FIELDS, 'email'),
        }),
      )}
    >
      <SheetHeader>
        <SheetTitle>Add Order Booker</SheetTitle>
        <SheetDescription>
          They sign in on their phone with this email and password.
        </SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <FormField id="ob-name" label="Full name" required error={errors.name?.message}>
          <Input id="ob-name" autoFocus aria-invalid={!!errors.name} {...form.register('name')} />
        </FormField>
        <FormField id="ob-email" label="Email" required error={errors.email?.message}>
          <Input
            id="ob-email"
            type="email"
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
        </FormField>
        <FormField id="ob-phone" label="Phone" error={errors.phone?.message}>
          <Input id="ob-phone" type="tel" {...form.register('phone')} />
        </FormField>
        <FormField
          id="ob-password"
          label="Password"
          required
          error={errors.password?.message}
          hint="At least 8 characters. Share it with the Order Booker."
        >
          <Input
            id="ob-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </FormField>
      </div>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <Loader2 className="animate-spin" />}
          Add Order Booker
        </Button>
      </SheetFooter>
    </form>
  );
}

function EditForm({ user, onDone }: { user: User; onDone: () => void }) {
  const update = useUpdateOrderBooker();
  const form = useForm({
    resolver: zodResolver(editFormSchema),
    defaultValues: { name: user.name, email: user.email, phone: user.phone ?? '', password: '' },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex h-full flex-col"
      onSubmit={form.handleSubmit(({ password, ...rest }) =>
        update.mutate(
          { id: user.id, body: password ? { ...rest, password } : rest },
          {
            onSuccess: () => {
              toast.success(
                password ? 'Saved. The new password is active.' : 'Order Booker updated',
              );
              onDone();
            },
            onError: (error) => showApiError(error, form.setError, FIELDS, 'email'),
          },
        ),
      )}
    >
      <SheetHeader>
        <SheetTitle>Edit Order Booker</SheetTitle>
        <SheetDescription>{user.email}</SheetDescription>
      </SheetHeader>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <FormField id="ob-name" label="Full name" required error={errors.name?.message}>
          <Input id="ob-name" aria-invalid={!!errors.name} {...form.register('name')} />
        </FormField>
        <FormField id="ob-email" label="Email" required error={errors.email?.message}>
          <Input
            id="ob-email"
            type="email"
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
        </FormField>
        <FormField id="ob-phone" label="Phone" error={errors.phone?.message}>
          <Input id="ob-phone" type="tel" {...form.register('phone')} />
        </FormField>
        <FormField
          id="ob-password"
          label="New password"
          error={errors.password?.message}
          hint="Leave empty to keep the current password. Setting one signs the booker out everywhere."
        >
          <Input
            id="ob-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
        </FormField>
      </div>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending || !form.formState.isDirty}>
          {update.isPending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      </SheetFooter>
    </form>
  );
}
