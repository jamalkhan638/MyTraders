import { zodResolver } from '@hookform/resolvers/zod';
import { createTenantSchema } from '@mytraders/shared-types';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FormField } from '@/components/form/FormField';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { showApiError } from '@/lib/api/form-errors';
import { useCreateTenant } from '../hooks/usePlatform';

const FIELDS = [
  'name',
  'currency',
  'timezone',
  'invoicePrefix',
  'invoiceNumberDigits',
  'admin.name',
  'admin.email',
  'admin.password',
] as const;

/** Creates a tenant (ACTIVE) with its first Admin — the same as the `org:create` CLI. */
export function CreateTenantPage() {
  const create = useCreateTenant();
  const navigate = useNavigate();
  const form = useForm({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
      name: '',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      invoicePrefix: 'INV-',
      invoiceNumberDigits: 6,
      admin: { name: '', email: '', password: '' },
    },
  });
  const { errors } = form.formState;

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
        <Link to="/platform/tenants">
          <ArrowLeft />
          Tenants
        </Link>
      </Button>
      <PageHeader
        title="Create tenant"
        description="A new distributor company and its first Admin. The Admin signs in with this email and sets up everything else."
      />
      <form
        noValidate
        className="grid max-w-3xl gap-4"
        onSubmit={form.handleSubmit((values) =>
          create.mutate(values, {
            onSuccess: (tenant) => {
              toast.success(`${tenant.name} created — ${tenant.primaryAdmin?.email} can sign in`);
              navigate(`/platform/tenants/${tenant.id}`);
            },
            onError: (error) => showApiError(error, form.setError, FIELDS, 'admin.email'),
          }),
        )}
      >
        <Card>
          <CardHeader>
            <CardTitle>Company</CardTitle>
            <CardDescription>Shown on invoices; the Admin can change these later.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="name"
              label="Company name"
              required
              error={errors.name?.message}
              className="sm:col-span-2"
            >
              <Input id="name" {...form.register('name')} />
            </FormField>
            <FormField id="currency" label="Currency" error={errors.currency?.message}>
              <Input id="currency" maxLength={3} {...form.register('currency')} />
            </FormField>
            <FormField id="timezone" label="Timezone" error={errors.timezone?.message}>
              <Input id="timezone" {...form.register('timezone')} />
            </FormField>
            <FormField
              id="invoicePrefix"
              label="Invoice number prefix"
              error={errors.invoicePrefix?.message}
            >
              <Input id="invoicePrefix" {...form.register('invoicePrefix')} />
            </FormField>
            <FormField
              id="invoiceNumberDigits"
              label="Invoice number digits"
              error={errors.invoiceNumberDigits?.message}
            >
              <Input
                id="invoiceNumberDigits"
                inputMode="numeric"
                {...form.register('invoiceNumberDigits')}
              />
            </FormField>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>First Admin</CardTitle>
            <CardDescription>
              Give these sign-in details to the owner. Emails are unique across the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="admin-name"
              label="Full name"
              required
              error={errors.admin?.name?.message}
            >
              <Input id="admin-name" {...form.register('admin.name')} />
            </FormField>
            <FormField id="admin-email" label="Email" required error={errors.admin?.email?.message}>
              <Input
                id="admin-email"
                type="email"
                autoComplete="off"
                {...form.register('admin.email')}
              />
            </FormField>
            <FormField
              id="admin-password"
              label="Password"
              required
              hint="At least 8 characters"
              error={errors.admin?.password?.message}
            >
              <Input
                id="admin-password"
                type="password"
                autoComplete="new-password"
                {...form.register('admin.password')}
              />
            </FormField>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            Create tenant
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/platform/tenants">Cancel</Link>
          </Button>
        </div>
      </form>
    </>
  );
}
