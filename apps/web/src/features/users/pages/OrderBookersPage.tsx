import { type ListUsersQueryInput, type User } from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Power, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatDateTime } from '@/lib/format/date';
import { OrderBookerFormSheet } from '../components/OrderBookerFormSheet';
import { ToggleActiveDialog } from '../components/ToggleActiveDialog';
import { UserRoleBadge, UserStatusBadge } from '../components/UserStatusBadge';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useUsers } from '../hooks/useUsers';

const PAGE_SIZE = 20;
type RoleFilter = 'ORDER_BOOKER' | 'ADMIN' | '';
type StatusFilter = 'active' | 'inactive' | '';

export function OrderBookersPage() {
  const me = useCurrentUser();
  const timeZone = me.organization?.timezone;
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('ORDER_BOOKER');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [formMode, setFormMode] = useState<
    { kind: 'create' } | { kind: 'edit'; user: User } | null
  >(null);
  const [toggling, setToggling] = useState<User | null>(null);

  const q = useDebouncedValue(search.trim());
  const params: ListUsersQueryInput = {
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    role: role || undefined,
    status: status || undefined,
  };
  const users = useUsers(params);

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      {
        header: 'Name',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-xs text-muted-foreground">{row.original.email}</div>
          </div>
        ),
      },
      { header: 'Phone', cell: ({ row }) => row.original.phone ?? '—' },
      { header: 'Role', cell: ({ row }) => <UserRoleBadge role={row.original.role} /> },
      { header: 'Status', cell: ({ row }) => <UserStatusBadge isActive={row.original.isActive} /> },
      {
        header: 'Last sign-in',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDateTime(row.original.lastLoginAt, timeZone)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <RowActions
            user={row.original}
            onEdit={() => setFormMode({ kind: 'edit', user: row.original })}
            onToggle={() => setToggling(row.original)}
          />
        ),
      },
    ],
    [timeZone],
  );

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };

  return (
    <>
      <PageHeader
        title="Order Bookers"
        description="People who book orders from shops using their phone."
        actions={
          <Button onClick={() => setFormMode({ kind: 'create' })}>
            <Plus />
            Add Order Booker
          </Button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email or phone"
            className="pl-9"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <NativeSelect
          value={role}
          onChange={(e) => resetPage(setRole)(e.target.value as RoleFilter)}
          aria-label="Role"
        >
          <option value="ORDER_BOOKER">Order Bookers</option>
          <option value="ADMIN">Admins</option>
          <option value="">All users</option>
        </NativeSelect>
        <NativeSelect
          value={status}
          onChange={(e) => resetPage(setStatus)(e.target.value as StatusFilter)}
          aria-label="Status"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NativeSelect>
      </div>

      <DataTable
        columns={columns}
        data={users.data?.items}
        isLoading={users.isPending}
        error={users.isError ? 'Could not load users.' : null}
        emptyMessage={
          q || status ? 'No users match these filters.' : 'No Order Bookers yet. Add the first one.'
        }
        getRowId={(u) => u.id}
        pagination={
          users.data
            ? { page, pageSize: PAGE_SIZE, total: users.data.total, onPageChange: setPage }
            : undefined
        }
        renderMobileCard={(u) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="font-medium">{u.name}</div>
              <div className="truncate text-sm text-muted-foreground">{u.email}</div>
              {u.phone && <div className="text-sm text-muted-foreground">{u.phone}</div>}
              <div className="flex gap-1.5 pt-1">
                <UserRoleBadge role={u.role} />
                <UserStatusBadge isActive={u.isActive} />
              </div>
            </div>
            <RowActions
              user={u}
              onEdit={() => setFormMode({ kind: 'edit', user: u })}
              onToggle={() => setToggling(u)}
            />
          </div>
        )}
      />

      <OrderBookerFormSheet mode={formMode} onClose={() => setFormMode(null)} />
      <ToggleActiveDialog user={toggling} onClose={() => setToggling(null)} />
    </>
  );
}

function RowActions({
  user,
  onEdit,
  onToggle,
}: {
  user: User;
  onEdit: () => void;
  onToggle: () => void;
}) {
  // Only Order Booker accounts are managed here (Admins are not editable in the MVP).
  if (user.role !== 'ORDER_BOOKER') return null;
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onEdit}
        aria-label={`Edit ${user.name}`}
        title="Edit"
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}`}
        title={user.isActive ? 'Deactivate' : 'Activate'}
        className={
          user.isActive
            ? 'text-destructive hover:text-destructive'
            : 'text-primary hover:text-primary'
        }
      >
        <Power />
      </Button>
    </div>
  );
}
