import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatDocumentNumber,
  type OrganizationSettings,
  type UpdateOrganizationSettings,
  updateOrganizationSettingsSchema,
} from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { showApiError } from '@/lib/api/form-errors';
import { useUpdateOrganizationSettings } from '../hooks/useOrganizationSettings';
import { LogoPreview } from './LogoPreview';

const FIELDS = [
  'name',
  'phone',
  'address',
  'town',
  'ntn',
  'strn',
  'logoUrl',
  'currency',
  'timezone',
  'invoicePrefix',
  'invoiceNumberDigits',
  'nextInvoiceNumber',
  'orderPrefix',
  'orderNumberDigits',
  'defaultTaxRate',
] as const;

function toFormValues(s: OrganizationSettings) {
  return {
    name: s.name,
    phone: s.phone ?? '',
    address: s.address ?? '',
    town: s.town ?? '',
    ntn: s.ntn ?? '',
    strn: s.strn ?? '',
    logoUrl: s.logoUrl ?? '',
    currency: s.currency,
    timezone: s.timezone,
    invoicePrefix: s.invoicePrefix,
    invoiceNumberDigits: s.invoiceNumberDigits,
    nextInvoiceNumber: s.nextInvoiceNumber,
    orderPrefix: s.orderPrefix,
    orderNumberDigits: s.orderNumberDigits,
    defaultTaxRate: s.defaultTaxRate,
  };
}

function supported(key: 'currency' | 'timeZone', current: string): string[] {
  const values = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf(key) : [];
  return values.includes(current) ? values : [current, ...values];
}

export function OrganizationSettingsForm({ settings }: { settings: OrganizationSettings }) {
  const update = useUpdateOrganizationSettings();
  const form = useForm({
    resolver: zodResolver(updateOrganizationSettingsSchema),
    values: toFormValues(settings),
    resetOptions: { keepDirtyValues: false },
  });
  const { errors, isDirty, dirtyFields } = form.formState;
  const currencies = useMemo(() => supported('currency', settings.currency), [settings.currency]);
  const timezones = useMemo(() => supported('timeZone', settings.timezone), [settings.timezone]);
  const currencyNames = useMemo(() => new Intl.DisplayNames(['en'], { type: 'currency' }), []);

  const [name, logoUrl, invoicePrefix, invoiceDigits, nextInvoice, orderPrefix, orderDigits] =
    useWatch({
      control: form.control,
      name: [
        'name',
        'logoUrl',
        'invoicePrefix',
        'invoiceNumberDigits',
        'nextInvoiceNumber',
        'orderPrefix',
        'orderNumberDigits',
      ],
    });

  const onSubmit = (values: UpdateOrganizationSettings) => {
    // Only send the next invoice number when it was changed; it may only move forward.
    const { nextInvoiceNumber, ...rest } = values;
    const body = dirtyFields.nextInvoiceNumber ? { ...rest, nextInvoiceNumber } : rest;
    update.mutate(body, {
      onSuccess: () => toast.success('Settings saved'),
      onError: (error) => showApiError(error, form.setError, FIELDS),
    });
  };

  const err = (field: (typeof FIELDS)[number]) => errors[field]?.message as string | undefined;

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-24">
      <Section title="Company" description="Printed on invoices as Distributor Information.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="name"
            label="Company name"
            required
            error={err('name')}
            className="sm:col-span-2"
          >
            <Input id="name" aria-invalid={!!errors.name} {...form.register('name')} />
          </FormField>
          <FormField id="phone" label="Phone" error={err('phone')}>
            <Input id="phone" type="tel" {...form.register('phone')} />
          </FormField>
          <FormField id="town" label="Town / City" error={err('town')}>
            <Input id="town" {...form.register('town')} />
          </FormField>
          <FormField id="address" label="Address" error={err('address')} className="sm:col-span-2">
            <Textarea id="address" rows={2} {...form.register('address')} />
          </FormField>
          <FormField id="ntn" label="NTN" error={err('ntn')}>
            <Input id="ntn" {...form.register('ntn')} />
          </FormField>
          <FormField id="strn" label="STRN" error={err('strn')}>
            <Input id="strn" {...form.register('strn')} />
          </FormField>
        </div>
      </Section>

      <Section title="Logo" description="Shown in the app and on printed invoices.">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <LogoPreview url={logoUrl as string} name={String(name ?? '')} />
          <FormField
            id="logoUrl"
            label="Logo image URL"
            error={err('logoUrl')}
            hint="Paste a link to your logo (https://…). Uploading a file will be added later."
            className="flex-1"
          >
            <Input id="logoUrl" type="url" placeholder="https://" {...form.register('logoUrl')} />
          </FormField>
        </div>
      </Section>

      <Section title="Region & currency">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="currency"
            label="Currency"
            error={err('currency')}
            hint="Used to display all amounts."
          >
            <NativeSelect id="currency" {...form.register('currency')}>
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code} — {currencyNames.of(code)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            id="timezone"
            label="Timezone"
            error={err('timezone')}
            hint="Defines “today” and “this month”."
          >
            <NativeSelect id="timezone" {...form.register('timezone')}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField
            id="defaultTaxRate"
            label="Default tax rate (%)"
            error={err('defaultTaxRate')}
            hint="Default for new products. Each invoice stores the rate actually used."
          >
            <Input id="defaultTaxRate" inputMode="decimal" {...form.register('defaultTaxRate')} />
          </FormField>
        </div>
      </Section>

      <Section
        title="Invoice & order numbering"
        description="Numbers are sequential per company and never reused."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="invoicePrefix" label="Invoice prefix" error={err('invoicePrefix')}>
            <Input id="invoicePrefix" {...form.register('invoicePrefix')} />
          </FormField>
          <FormField id="invoiceNumberDigits" label="Digits" error={err('invoiceNumberDigits')}>
            <Input
              id="invoiceNumberDigits"
              type="number"
              min={3}
              max={12}
              {...form.register('invoiceNumberDigits')}
            />
          </FormField>
          <FormField
            id="nextInvoiceNumber"
            label="Next invoice number"
            error={err('nextInvoiceNumber')}
            hint="Can only be increased, e.g. to continue your paper invoice book."
          >
            <Input
              id="nextInvoiceNumber"
              type="number"
              min={1}
              {...form.register('nextInvoiceNumber')}
            />
          </FormField>
        </div>
        <NumberPreview
          label="Next invoice"
          value={preview(invoicePrefix, invoiceDigits, nextInvoice)}
        />

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <FormField id="orderPrefix" label="Order prefix" error={err('orderPrefix')}>
            <Input id="orderPrefix" {...form.register('orderPrefix')} />
          </FormField>
          <FormField id="orderNumberDigits" label="Digits" error={err('orderNumberDigits')}>
            <Input
              id="orderNumberDigits"
              type="number"
              min={3}
              max={12}
              {...form.register('orderNumberDigits')}
            />
          </FormField>
        </div>
        <NumberPreview
          label="Next order"
          value={preview(orderPrefix, orderDigits, settings.nextOrderNumber)}
        />
      </Section>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-card/95 backdrop-blur lg:left-64">
        <div className="flex items-center justify-end gap-2 px-4 py-3 lg:px-8">
          {isDirty && (
            <span className="mr-auto text-sm text-muted-foreground">You have unsaved changes</span>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || update.isPending}
            onClick={() => form.reset()}
          >
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty || update.isPending}>
            {update.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}

function preview(prefix: unknown, digits: unknown, value: unknown): string {
  const d = Number(digits);
  const v = Number(value);
  if (!Number.isInteger(d) || d < 1 || d > 12 || !Number.isInteger(v) || v < 1) return '—';
  return formatDocumentNumber(String(prefix ?? ''), d, v);
}

function NumberPreview({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      {label}: <span className="font-mono font-medium text-foreground">{value}</span>
    </p>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
