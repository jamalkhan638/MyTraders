import { ArrowLeft, Ban, KeyRound, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { ResetAdminPasswordDialog, type ResetTarget } from '../components/ResetAdminPasswordDialog';
import { type StatusTarget, TenantStatusDialog } from '../components/TenantStatusDialog';
import { TenantStatusBadge } from '../components/TenantStatusBadge';
import { useTenant } from '../hooks/usePlatform';

/** One tenant: identity, status, Admins and usage counts — no business records (D-38). */
export function TenantDetailsPage() {
  const { id = '' } = useParams();
  const tenant = useTenant(id);
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null);

  if (tenant.isPending) return <Skeleton className="h-96 w-full" />;
  if (tenant.isError) {
    return (
      <Card className="max-w-xl">
        <CardContent className="space-y-4 py-8 text-sm">
          <p>This tenant could not be found.</p>
          <Button variant="outline" asChild>
            <Link to="/platform/tenants">Back to tenants</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const t = tenant.data;
  const suspended = t.status === 'SUSPENDED';

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
        <Link to="/platform/tenants">
          <ArrowLeft />
          Tenants
        </Link>
      </Button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t.name}</h1>
            <TenantStatusBadge status={t.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {formatDate(t.createdAt)} · Tenant ID{' '}
            <span className="font-mono text-xs">{t.id}</span>
          </p>
        </div>
        {suspended || t.status === 'TRIAL' ? (
          <Button onClick={() => setStatusTarget(t)}>
            <RotateCcw />
            {suspended ? 'Reactivate tenant' : 'Activate tenant'}
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => setStatusTarget(t)}>
            <Ban />
            Suspend tenant
          </Button>
        )}
      </div>

      {suspended && (
        <div
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
          role="status"
          data-testid="suspended-banner"
        >
          <span className="font-medium text-destructive">Suspended</span>
          {t.statusChangedAt && ` on ${formatDateTime(t.statusChangedAt)}`}
          {t.statusChangedBy && ` by ${t.statusChangedBy.name}`}. Reason: {t.suspensionReason}. Its
          users cannot sign in; all data is kept.
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="tenant-counts">
        <Count
          label="Users"
          value={t.counts.users}
          note={`${t.counts.admins} Admin · ${t.counts.orderBookers} Order Bookers · ${t.counts.activeUsers} active`}
        />
        <Count label="Shops" value={t.counts.shops} />
        <Count label="Products" value={t.counts.products} />
        <Count label="Invoices" value={t.counts.invoices} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Company</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm [&>div]:flex [&>div]:justify-between [&>div]:gap-3 [&_dt]:text-muted-foreground">
              <div>
                <dt>Status</dt>
                <dd>
                  <TenantStatusBadge status={t.status} />
                </dd>
              </div>
              <div>
                <dt>Town</dt>
                <dd>{t.town ?? '—'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{t.phone ?? '—'}</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{t.currency}</dd>
              </div>
              <div>
                <dt>Timezone</dt>
                <dd>{t.timezone}</dd>
              </div>
              <div>
                <dt>Invoice prefix</dt>
                <dd className="font-mono">{t.invoicePrefix}</dd>
              </div>
              <div>
                <dt>Last sign-in</dt>
                <dd>{t.lastLoginAt ? formatDateTime(t.lastLoginAt) : 'Never'}</dd>
              </div>
              <div>
                <dt>Status changed</dt>
                <dd>{t.statusChangedAt ? formatDateTime(t.statusChangedAt) : '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 lg:col-span-2">
          <CardHeader className="border-b px-4 py-3">
            <CardTitle className="text-base">Admins</CardTitle>
          </CardHeader>
          <ul className="divide-y" data-testid="tenant-admins">
            {t.admins.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium">
                    {a.name}
                    {a.id === t.primaryAdmin?.id && (
                      <Badge variant="muted" className="ml-2">
                        Primary
                      </Badge>
                    )}
                    {!a.isActive && (
                      <Badge variant="destructive" className="ml-2">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-muted-foreground">{a.email}</div>
                  <div className="text-xs text-muted-foreground">
                    Last sign-in {a.lastLoginAt ? formatDateTime(a.lastLoginAt) : 'never'}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setResetTarget({ tenantId: t.id, userId: a.id, name: a.name, email: a.email })
                  }
                  aria-label={`Reset password of ${a.name}`}
                >
                  <KeyRound />
                  Reset password
                </Button>
              </li>
            ))}
          </ul>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            Order Bookers are managed by the tenant&apos;s Admins. The platform shows usage counts
            only — never shops, invoices, payments or other business data.
          </p>
        </Card>
      </div>
      <TenantStatusDialog target={statusTarget} onClose={() => setStatusTarget(null)} />
      <ResetAdminPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />
    </>
  );
}

function Count({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card className="py-4">
      <CardContent className="px-5">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}
