import { type Area, type ListAreasQueryInput } from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import { BookOpenText, MapPin, Pencil, Plus, Power, Search } from 'lucide-react';
import { Link } from 'react-router';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatDate } from '@/lib/format/date';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { AreaFormDialog, type AreaDialogMode } from '../components/AreaFormDialog';
import { ToggleAreaDialog } from '../components/ToggleAreaDialog';
import { useAreas } from '../hooks/useAreas';

const PAGE_SIZE = 20;
type StatusFilter = 'active' | 'inactive' | '';

export function AreasPage() {
  const timeZone = useCurrentUser().organization?.timezone;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<AreaDialogMode | null>(null);
  const [toggling, setToggling] = useState<Area | null>(null);

  const q = useDebouncedValue(search.trim());
  const params: ListAreasQueryInput = {
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
  };
  const areas = useAreas(params);
  const filtered = Boolean(q || status);

  const columns = useMemo<ColumnDef<Area, unknown>[]>(
    () => [
      {
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      { header: 'Status', cell: ({ row }) => <AreaStatusBadge isActive={row.original.isActive} /> },
      {
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.createdAt, timeZone)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <AreaActions
            area={row.original}
            onEdit={() => setDialog({ kind: 'edit', area: row.original })}
            onToggle={() => setToggling(row.original)}
          />
        ),
      },
    ],
    [timeZone],
  );

  return (
    <section className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Areas</h2>
          <p className="text-sm text-muted-foreground">
            Market areas used to group shops and filter shop lists.
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <Plus />
          Add area
        </Button>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search areas"
            className="pl-9"
            value={search}
            aria-label="Search areas"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <NativeSelect
          value={status}
          aria-label="Status"
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NativeSelect>
      </div>

      <DataTable
        columns={columns}
        data={areas.data?.items}
        isLoading={areas.isPending}
        error={areas.isError ? 'Could not load areas. Please try again.' : null}
        emptyMessage={
          filtered ? (
            'No areas match these filters.'
          ) : (
            <span className="flex flex-col items-center gap-2">
              <MapPin className="size-6" />
              No areas yet. Add your first market area.
            </span>
          )
        }
        getRowId={(a) => a.id}
        pagination={
          areas.data
            ? { page, pageSize: PAGE_SIZE, total: areas.data.total, onPageChange: setPage }
            : undefined
        }
        renderMobileCard={(a) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="font-medium">{a.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AreaStatusBadge isActive={a.isActive} />
                Created {formatDate(a.createdAt, timeZone)}
              </div>
            </div>
            <AreaActions
              area={a}
              onEdit={() => setDialog({ kind: 'edit', area: a })}
              onToggle={() => setToggling(a)}
            />
          </div>
        )}
      />

      <AreaFormDialog mode={dialog} onClose={() => setDialog(null)} />
      <ToggleAreaDialog area={toggling} onClose={() => setToggling(null)} />
    </section>
  );
}

function AreaStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge>Active</Badge> : <Badge variant="destructive">Inactive</Badge>;
}

function AreaActions({
  area,
  onEdit,
  onToggle,
}: {
  area: Area;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" asChild title="View ledger">
        <Link
          to={`/finance/area-ledger?areaId=${area.id}`}
          aria-label={`View ledger of ${area.name}`}
        >
          <BookOpenText />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onEdit}
        aria-label={`Edit ${area.name}`}
        title="Edit"
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label={`${area.isActive ? 'Deactivate' : 'Activate'} ${area.name}`}
        title={area.isActive ? 'Deactivate' : 'Activate'}
        className={
          area.isActive
            ? 'text-destructive hover:text-destructive'
            : 'text-primary hover:text-primary'
        }
      >
        <Power />
      </Button>
    </div>
  );
}
