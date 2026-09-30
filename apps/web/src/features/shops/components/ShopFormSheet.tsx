import { zodResolver } from '@hookform/resolvers/zod';
import { type CreateShopInput, createShopSchema, type Shop } from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { showApiError } from '@/lib/api/form-errors';
import { useShopLookups } from '../hooks/useShopLookups';
import { useCreateShop, useUpdateShop } from '../hooks/useShops';

export type ShopSheetMode = { kind: 'create' } | { kind: 'edit'; shop: Shop };

const FIELDS = [
  'name',
  'contactPerson',
  'phone',
  'address',
  'areaId',
  'categoryId',
  'assignedOrderBookerId',
  'ntn',
  'strn',
  'cnic',
] as const;

function toFormValues(shop?: Shop): CreateShopInput {
  return {
    name: shop?.name ?? '',
    contactPerson: shop?.contactPerson ?? '',
    phone: shop?.phone ?? '',
    address: shop?.address ?? '',
    areaId: shop?.area.id ?? '',
    categoryId: shop?.category?.id ?? '',
    assignedOrderBookerId: shop?.assignedOrderBooker?.id ?? '',
    ntn: shop?.ntn ?? '',
    strn: shop?.strn ?? '',
    cnic: shop?.cnic ?? '',
  };
}

/** Right-side drawer to add or edit a shop (docs/frontend-guidelines.md §3). */
export function ShopFormSheet({
  mode,
  onClose,
}: {
  mode: ShopSheetMode | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg">
        {mode && (
          <ShopForm
            key={mode.kind === 'edit' ? mode.shop.id : 'new'}
            shop={mode.kind === 'edit' ? mode.shop : undefined}
            onDone={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Active options, plus the currently selected one even if it was deactivated later. */
function options<T extends { id: string; name: string; isActive: boolean }>(
  items: T[],
  currentId?: string,
) {
  return items.filter((item) => item.isActive || item.id === currentId);
}

function ShopForm({ shop, onDone }: { shop?: Shop; onDone: () => void }) {
  const lookups = useShopLookups();
  const create = useCreateShop();
  const update = useUpdateShop();
  const pending = create.isPending || update.isPending;
  const form = useForm({
    resolver: zodResolver(createShopSchema),
    defaultValues: toFormValues(shop),
  });
  const { errors, isDirty } = form.formState;
  const err = (field: (typeof FIELDS)[number]) => errors[field]?.message as string | undefined;

  const onSubmit = form.handleSubmit((values) => {
    const callbacks = {
      onSuccess: () => {
        toast.success(shop ? 'Shop updated' : `Shop “${values.name}” added`);
        onDone();
      },
      onError: (error: unknown) => showApiError(error, form.setError, FIELDS),
    };
    if (shop) update.mutate({ id: shop.id, body: values }, callbacks);
    else create.mutate(values, callbacks);
  });

  const label = (item: { name: string; isActive: boolean }) =>
    item.isActive ? item.name : `${item.name} (inactive)`;

  return (
    <form noValidate onSubmit={onSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{shop ? 'Edit shop' : 'Add shop'}</SheetTitle>
        <SheetDescription>Only the shop name and area are required.</SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <Group title="Shop">
          <FormField id="name" label="Shop name" required error={err('name')}>
            <Input id="name" autoFocus aria-invalid={!!errors.name} {...form.register('name')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="contactPerson"
              label="Owner / contact person"
              error={err('contactPerson')}
            >
              <Input id="contactPerson" {...form.register('contactPerson')} />
            </FormField>
            <FormField id="phone" label="Phone" error={err('phone')}>
              <Input
                id="phone"
                type="tel"
                aria-invalid={!!errors.phone}
                {...form.register('phone')}
              />
            </FormField>
          </div>
          <FormField id="address" label="Address" error={err('address')}>
            <Textarea id="address" rows={2} {...form.register('address')} />
          </FormField>
        </Group>

        <Group title="Assignment">
          <FormField id="areaId" label="Area" required error={err('areaId')}>
            <NativeSelect
              id="areaId"
              aria-invalid={!!errors.areaId}
              disabled={lookups.isLoading}
              {...form.register('areaId')}
            >
              <option value="">{lookups.isLoading ? 'Loading…' : 'Choose an area'}</option>
              {options(lookups.areas, shop?.area.id).map((a) => (
                <option key={a.id} value={a.id}>
                  {label(a)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="categoryId" label="Shop category" error={err('categoryId')}>
              <NativeSelect
                id="categoryId"
                disabled={lookups.isLoading}
                {...form.register('categoryId')}
              >
                <option value="">— None —</option>
                {options(lookups.categories, shop?.category?.id).map((c) => (
                  <option key={c.id} value={c.id}>
                    {label(c)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              id="assignedOrderBookerId"
              label="Order booker"
              error={err('assignedOrderBookerId')}
            >
              <NativeSelect
                id="assignedOrderBookerId"
                disabled={lookups.isLoading}
                {...form.register('assignedOrderBookerId')}
              >
                <option value="">— Unassigned —</option>
                {options(lookups.bookers, shop?.assignedOrderBooker?.id).map((b) => (
                  <option key={b.id} value={b.id}>
                    {label(b)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
        </Group>

        <Group title="Tax information">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField id="ntn" label="NTN" error={err('ntn')}>
              <Input id="ntn" {...form.register('ntn')} />
            </FormField>
            <FormField id="strn" label="STRN" error={err('strn')}>
              <Input id="strn" {...form.register('strn')} />
            </FormField>
            <FormField id="cnic" label="CNIC" error={err('cnic')}>
              <Input
                id="cnic"
                inputMode="numeric"
                placeholder="12345-1234567-1"
                aria-invalid={!!errors.cnic}
                {...form.register('cnic')}
              />
            </FormField>
          </div>
        </Group>
      </div>

      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (shop !== undefined && !isDirty)}>
          {pending && <Loader2 className="animate-spin" />}
          {shop ? 'Save changes' : 'Add shop'}
        </Button>
      </SheetFooter>
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-sm font-semibold text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}
