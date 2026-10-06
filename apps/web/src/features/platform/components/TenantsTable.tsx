import { type TenantSummary } from '@mytraders/shared-types';
import { Ban, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { plural } from '@/lib/format/number';
import { type StatusTarget } from './TenantStatusDialog';
import { TenantStatusBadge } from './TenantStatusBadge';

/** Tenants with their primary Admin and usage counts; cards on phones, a table from md up. */
export function TenantsTable({
  tenants,
  onStatus,
  empty = 'No tenants match.',
}: {
  tenants: TenantSummary[];
  onStatus: (target: StatusTarget) => void;
  empty?: string;
}) {
  if (tenants.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  const action = (t: TenantSummary) =>
    t.status === 'SUSPENDED' || t.status === 'TRIAL' ? (
      <Button
        size="sm"
        variant="outline"
        onClick={() => onStatus(t)}
        aria-label={`${t.status === 'SUSPENDED' ? 'Reactivate' : 'Activate'} ${t.name}`}
      >
        <RotateCcw />
        {t.status === 'SUSPENDED' ? 'Reactivate' : 'Activate'}
      </Button>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        onClick={() => onStatus(t)}
        aria-label={`Suspend ${t.name}`}
      >
        <Ban />
        Suspend
      </Button>
    );
  return (
    <>
      <ul className="divide-y md:hidden">
        {tenants.map((t) => (
          <li key={t.id} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/platform/tenants/${t.id}`} className="font-medium text-primary">
                  {t.name}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  {t.primaryAdmin?.email ?? 'No Admin'}
                </div>
              </div>
              <TenantStatusBadge status={t.status} />
            </div>
            <div className="text-xs text-muted-foreground">
              {[
                plural(t.counts.users, 'user'),
                plural(t.counts.shops, 'shop'),
                plural(t.counts.products, 'product'),
                plural(t.counts.invoices, 'invoice'),
              ].join(' · ')}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>Created {formatDate(t.createdAt)}</span>
              {action(t)}
            </div>
          </li>
        ))}
      </ul>
      <div className="relative hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-sm" data-testid="tenants-table">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>Tenant</th>
              <th>Status</th>
              <th>Primary Admin</th>
              <th className="!text-right">Users</th>
              <th className="!text-right">Shops</th>
              <th className="!text-right">Products</th>
              <th className="!text-right">Invoices</th>
              <th>Last sign-in</th>
              <th>Created</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map((t) => (
              <tr key={t.id} className="[&>td]:px-4 [&>td]:py-2.5">
                <td>
                  <Link
                    to={`/platform/tenants/${t.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t.name}
                  </Link>
                </td>
                <td>
                  <TenantStatusBadge status={t.status} />
                </td>
                <td>
                  {t.primaryAdmin ? (
                    <>
                      <div>{t.primaryAdmin.name}</div>
                      <div className="text-xs text-muted-foreground">{t.primaryAdmin.email}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="text-right tabular-nums">{t.counts.users}</td>
                <td className="text-right tabular-nums">{t.counts.shops}</td>
                <td className="text-right tabular-nums">{t.counts.products}</td>
                <td className="text-right tabular-nums">{t.counts.invoices}</td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {t.lastLoginAt ? formatDateTime(t.lastLoginAt) : 'Never'}
                </td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {formatDate(t.createdAt)}
                </td>
                <td className="text-right">{action(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
