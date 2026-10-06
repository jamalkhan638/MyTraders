import { type OrganizationStatus } from '@mytraders/shared-types';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { TenantsTable } from '../components/TenantsTable';
import { type StatusTarget, TenantStatusDialog } from '../components/TenantStatusDialog';
import { useTenants } from '../hooks/usePlatform';

const PAGE_SIZE = 20;

/** All tenants with search by name and a status filter. */
export function TenantsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as OrganizationStatus | '';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusTarget, setStatusTarget] = useState<StatusTarget | null>(null);
  const q = useDebouncedValue(search.trim());
  const tenants = useTenants({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
  });
  const pages = Math.max(1, Math.ceil((tenants.data?.total ?? 0) / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Every distributor company on the platform. Suspend to block all its users at once; data is kept."
        actions={
          <Button asChild>
            <Link to="/platform/tenants/new">
              <Plus />
              Create tenant
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search tenant name"
            aria-label="Search tenants"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <NativeSelect
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setParams(e.target.value ? { status: e.target.value } : {}, { replace: true });
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="TRIAL">Trial</option>
        </NativeSelect>
      </div>
      <Card className="gap-0 py-0">
        {tenants.isPending ? (
          <Skeleton className="m-4 h-48" />
        ) : tenants.isError ? (
          <p className="px-4 py-10 text-center text-sm text-destructive">Could not load tenants.</p>
        ) : (
          <TenantsTable tenants={tenants.data.items} onStatus={setStatusTarget} />
        )}
      </Card>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      <TenantStatusDialog target={statusTarget} onClose={() => setStatusTarget(null)} />
    </>
  );
}
