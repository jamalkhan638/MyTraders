import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateProductInput,
  createProductSchema,
  PRODUCT_UNIT_LABELS,
  type Product,
  ProductType,
  ProductUnit,
  WEIGHT_BASIS_LABELS,
  WeightBasis,
} from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { useOrganizationSettings } from '@/features/settings/hooks/useOrganizationSettings';
import { showApiError } from '@/lib/api/form-errors';
import { useCreateProduct, useUpdateProduct } from '../hooks/useProducts';

export type ProductSheetMode = { kind: 'create' } | { kind: 'edit'; product: Product };

const FIELDS = [
  'name',
  'code',
  'type',
  'rateCode',
  'retailPrice',
  'tradePrice',
  'invoiceCostPrice',
  'defaultTaxRate',
  'weight',
  'weightUnit',
  'weightBasis',
  'piecesPerCarton',
] as const;

const TYPE_HINTS: Record<ProductType, string> = {
  TIN: 'Invoiced by pieces (Qty Pcs).',
  POUCH: 'Invoiced by cartons (Qty Ctn). Qty Pcs = Qty Ctn × pieces per carton.',
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function toFormValues(product: Product | undefined, defaultTaxRate: string): CreateProductInput {
  return {
    name: product?.name ?? '',
    code: product?.code ?? '',
    // Empty until chosen; the schema rejects it with "Choose TIN or POUCH".
    type: product?.type ?? ('' as ProductType),
    rateCode: product?.rateCode ?? '',
    retailPrice: product?.retailPrice ?? '',
    tradePrice: product?.tradePrice ?? '',
    invoiceCostPrice: product?.invoiceCostPrice ?? '',
    defaultTaxRate: product?.defaultTaxRate ?? defaultTaxRate,
    weight: product?.weight ?? '',
    weightUnit: product?.weightUnit ?? '',
    weightBasis: product?.weightBasis ?? '',
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
        {mode?.kind === 'edit' && (
          <ProductForm key={mode.product.id} product={mode.product} onDone={onClose} />
        )}
        {mode?.kind === 'create' && <NewProductForm onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

/** A new product starts with the company's default tax rate (Settings), which the Admin can change. */
function NewProductForm({ onDone }: { onDone: () => void }) {
  const settings = useOrganizationSettings();
  if (settings.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  return <ProductForm defaultTaxRate={settings.data?.defaultTaxRate ?? ''} onDone={onDone} />;
}

function ProductForm({
  product,
  defaultTaxRate = '',
  onDone,
}: {
  product?: Product;
  defaultTaxRate?: string;
  onDone: () => void;
}) {
  const currency = useCurrentUser().organization?.currency ?? '';
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const pending = create.isPending || update.isPending;
  const form = useForm({
    resolver: zodResolver(createProductSchema),
    defaultValues: toFormValues(product, defaultTaxRate),
  });
  const { errors, isDirty } = form.formState;
  const err = (field: (typeof FIELDS)[number]) => errors[field]?.message as string | undefined;
  const type = useWatch({ control: form.control, name: 'type' }) as ProductType | '';
  const weight = useWatch({ control: form.control, name: 'weight' });
  const hasWeight = typeof weight === 'string' && weight.trim() !== '';

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

  const money = (
    id: 'retailPrice' | 'tradePrice' | 'invoiceCostPrice',
    label: string,
    hint: string,
  ) => (
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
          A TIN is sold by the piece, a POUCH by the carton. The trade price sets the invoice value.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <Group title="Product">
          <FormField id="name" label="Product name" required error={err('name')}>
            <Input id="name" autoFocus aria-invalid={!!errors.name} {...form.register('name')} />
          </FormField>
          <FormField
            id="type"
            label="Type"
            required
            error={err('type')}
            hint={type ? TYPE_HINTS[type] : 'TIN or POUCH decides how invoice quantities work.'}
          >
            <NativeSelect id="type" aria-invalid={!!errors.type} {...form.register('type')}>
              <option value="">Choose…</option>
              {Object.values(ProductType).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
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

        <Group
          title={
            type === 'POUCH' ? 'Prices per carton' : type === 'TIN' ? 'Prices per piece' : 'Prices'
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {money('tradePrice', 'Trade price (T.P)', 'Drives the invoice value.')}
            {money(
              'invoiceCostPrice',
              'Invoice / cost price',
              'What you pay the company. Used for profit only.',
            )}
            {money(
              'retailPrice',
              'Retail price (R.P)',
              'Display only — not used in invoice totals.',
            )}
            <FormField
              id="defaultTaxRate"
              label="Default tax rate (%)"
              required
              error={err('defaultTaxRate')}
              hint="Pre-filled on invoices; each invoice keeps the rate it used."
            >
              <Input
                id="defaultTaxRate"
                inputMode="decimal"
                placeholder="e.g. 18"
                aria-invalid={!!errors.defaultTaxRate}
                {...form.register('defaultTaxRate')}
              />
            </FormField>
          </div>
        </Group>

        <Group title="Weight & packing">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              id="weight"
              label="Weight"
              error={err('weight')}
              hint="For total weight / tons."
            >
              <Input
                id="weight"
                inputMode="decimal"
                placeholder="e.g. 4.5"
                aria-invalid={!!errors.weight}
                {...form.register('weight')}
              />
            </FormField>
            <FormField id="weightUnit" label="Unit" required={hasWeight} error={err('weightUnit')}>
              <NativeSelect
                id="weightUnit"
                aria-invalid={!!errors.weightUnit}
                {...form.register('weightUnit')}
              >
                <option value="">—</option>
                {Object.values(ProductUnit).map((unit) => (
                  <option key={unit} value={unit}>
                    {PRODUCT_UNIT_LABELS[unit]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              id="weightBasis"
              label="Weight is"
              required={hasWeight}
              error={err('weightBasis')}
            >
              <NativeSelect
                id="weightBasis"
                aria-invalid={!!errors.weightBasis}
                {...form.register('weightBasis')}
              >
                <option value="">—</option>
                {Object.values(WeightBasis).map((basis) => (
                  <option key={basis} value={basis}>
                    {capitalize(WEIGHT_BASIS_LABELS[basis])}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField
            id="piecesPerCarton"
            label="Pieces per carton"
            required={type === 'POUCH'}
            error={err('piecesPerCarton')}
            hint={
              type === 'POUCH'
                ? 'Qty Pcs on the invoice = Qty Ctn × pieces per carton.'
                : 'Optional for a TIN — reference only.'
            }
          >
            <Input
              id="piecesPerCarton"
              inputMode="numeric"
              placeholder="e.g. 5"
              className="sm:max-w-40"
              aria-invalid={!!errors.piecesPerCarton}
              {...form.register('piecesPerCarton')}
            />
          </FormField>
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
