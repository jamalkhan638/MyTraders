import { Building2, CircleCheck, CirclePause, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { cn } from '@/lib/utils';
import { TenantsTable } from '../components/TenantsTable';
import { type StatusTarget, TenantStatusDialog } from '../components/TenantStatusDialog';
import { usePlatformSummary, useTenants } from '../hooks/usePlatform';

/** Super Admin home: tenant counts by status and the newest tenants (D-38). */
export function PlatformDashboardPage() {
  const user = useCurrentUser();
  const summary = usePlatformSummary();
  const recent = useTenants({ page: 1, pageSize: 5 });
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back, {user.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">Platform overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenants (distributor companies) using MyTraders.
          </p>
        </div>
        <Button asChild>
          <Link to="/platform/tenants/new">
            <Plus />
            Create tenant
          </Link>
        </Button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {summary.isPending ? (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)
        ) : summary.isError ? (
          <p className="text-sm text-destructive">Could not load the summary.</p>
        ) : (
          <>
            <Stat
              testId="card-total"
              icon={<Building2 />}
              tone="bg-blue-50 text-blue-600"
              label="Total tenants"
              value={summary.data.totalTenants}
              to="/platform/tenants"
            />
            <Stat
              testId="card-active"
              icon={<CircleCheck />}
              tone="bg-emerald-50 text-emerald-700"
              label="Active tenants"
              value={summary.data.activeTenants}
              to="/platform/tenants?status=ACTIVE"
              note={
                summary.data.trialTenants > 0
                  ? `+ ${summary.data.trialTenants} on trial`
                  : undefined
              }
            />
            <Stat
              testId="card-suspended"
              icon={<CirclePause />}
              tone="bg-red-50 text-red-600"
              label="Suspended tenants"
              value={summary.data.suspendedTenants}
              to="/platform/tenants?status=SUSPENDED"
            />
          </>
        )}
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3">
          <CardTitle className="text-base">Newest tenants</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/platform/tenants">View all</Link>
          </Button>
        </CardHeader>
        {recent.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : (
          <TenantsTable
            tenants={recent.data?.items ?? []}
            onStatus={setStatusTarget}
            empty="No tenants yet. Create the first one."
          />
        )}
      </Card>
      <TenantStatusDialog target={statusTarget} onClose={() => setStatusTarget(null)} />
    </>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
  to,
  note,
  testId,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: number;
  to: string;
  note?: string;
  testId: string;
}) {
  return (
    <Card className="py-4 transition-colors hover:border-primary/40" data-testid={testId}>
      <Link
        to={to}
        className="block rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <CardContent className="flex items-center gap-3.5 px-5">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[22px]',
              tone,
            )}
            aria-hidden
          >
            {icon}
          </span>
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold tabular-nums" data-testid={`${testId}-value`}>
              {value}
            </div>
            {note && <div className="text-xs text-muted-foreground">{note}</div>}
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
