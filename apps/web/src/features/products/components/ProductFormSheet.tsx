import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateProductInput,
  createProductSchema,
  PRODUCT_UNIT_LABELS,
  type Product,
  ProductUnit,
} from '@mytraders/shared-types';
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
import { useCurrentUser } from '@/features/auth/auth-context';
import { showApiError } from '@/lib/api/form-errors';
import { useCreateProduct, useUpdateProduct } from '../hooks/useProducts';

export type ProductSheetMode = { kind: 'create' } | { kind: 'edit'; product: Product };

const FIELDS = [
  'name',
  'code',
  'rateCode',
  'retailPrice',
  'tradePrice',
  'costPrice',
  'weight',
  'unit',
  'piecesPerCarton',
] as const;

function toFormValues(product?: Product): CreateProductInput {
  return {
    name: product?.name ?? '',
    code: product?.code ?? '',
    rateCode: product?.rateCode ?? '',
    retailPrice: product?.retailPrice ?? '',
    tradePrice: product?.tradePrice ?? '',
    costPrice: product?.costPrice ?? '',
    weight: product?.weight ?? '',
    unit: product?.unit ?? '',
    piecesPerCarton: product?.piecesPerCarton?.toString() ?? '',
  };
}

/** Right-side drawer to add or edit a product (docs/frontend-guidelines.md §3). */
export function ProductFormSheet({
  mode,
  onClose,
}: {
  mode: ProductSheetMode | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg">
        {mode && (
          <ProductForm
            key={mode.kind === 'edit' ? mode.product.id : 'new'}
            product={mode.kind === 'edit' ? mode.product : undefined}
            onDone={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const currency = useCurrentUser().organization?.currency ?? '';
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const pending = create.isPending || update.isPending;
  const form = useForm({
    resolver: zodResolver(createProductSchema),
    defaultValues: toFormValues(product),
  });
  const { errors, isDirty } = form.formState;
  const err = (field: (typeof FIELDS)[number]) => errors[field]?.message as string | undefined;

  const onSubmit = form.handleSubmit((values) => {
    const callbacks = {
      onSuccess: () => {
        toast.success(product ? 'Product updated' : `Product “${values.name}” added`);
        onDone();
      },
      onError: (error: unknown) => showApiError(error, form.setError, FIELDS, 'code'),
    };
    if (product) update.mutate({ id: product.id, body: values }, callbacks);
    else create.mutate(values, callbacks);
  });

  const money = (id: 'retailPrice' | 'tradePrice' | 'costPrice', label: string, hint: string) => (
    <FormField id={id} label={`${label} (${currency})`} required error={err(id)} hint={hint}>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0.00"
        aria-invalid={!!errors[id]}
        {...form.register(id)}
      />
    </FormField>
  );

  return (
    <form noValidate onSubmit={onSubmit} className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{product ? 'Edit product' : 'Add product'}</SheetTitle>
        <SheetDescription>
          One product is one selling unit, e.g. one carton. Prices are per unit. Tax is calculated
          on the invoice.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <Group title="Product">
          <FormField id="name" label="Product name" required error={err('name')}>
            <Input id="name" autoFocus aria-invalid={!!errors.name} {...form.register('name')} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="code"
              label="Product code"
              error={err('code')}
              hint="Unique within your company."
            >
              <Input id="code" aria-invalid={!!errors.code} {...form.register('code')} />
            </FormField>
            <FormField
              id="rateCode"
              label="Rate code"
              error={err('rateCode')}
              hint="For display on invoices only."
            >
              <Input id="rateCode" {...form.register('rateCode')} />
            </FormField>
          </div>
        </Group>

        <Group title="Prices per unit">
          <div className="grid gap-4 sm:grid-cols-2">
            {money('retailPrice', 'Retail price (R.P)', 'Including tax.')}
            {money('tradePrice', 'Trade price (T.P)', 'Excluding FED.')}
            {money('costPrice', 'Cost price', 'What you pay the company. Used for profit.')}
          </div>
        </Group>

        <Group title="Weight & packing">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="weight"
              label="Weight"
              error={err('weight')}
              hint="Per unit, used for total weight / tons."
            >
              <Input
                id="weight"
                inputMode="decimal"
                placeholder="e.g. 4.5"
                aria-invalid={!!errors.weight}
                {...form.register('weight')}
              />
            </FormField>
            <FormField id="unit" label="Unit" error={err('unit')}>
              <NativeSelect id="unit" {...form.register('unit')}>
                <option value="">—</option>
                {Object.values(ProductUnit).map((unit) => (
                  <option key={unit} value={unit}>
                    {PRODUCT_UNIT_LABELS[unit]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              id="piecesPerCarton"
              label="Pieces per carton"
              error={err('piecesPerCarton')}
            >
              <Input
                id="piecesPerCarton"
                inputMode="numeric"
                placeholder="e.g. 5"
                aria-invalid={!!errors.piecesPerCarton}
                {...form.register('piecesPerCarton')}
              />
            </FormField>
          </div>
        </Group>
      </div>

      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (product !== undefined && !isDirty)}>
          {pending && <Loader2 className="animate-spin" />}
          {product ? 'Save changes' : 'Add product'}
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
