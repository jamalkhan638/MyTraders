import { type ListShopsQueryInput, type Shop, UNASSIGNED } from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus, Power, Search, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { DataTable } from '@/components/data-table/DataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { ShopFormSheet, type ShopSheetMode } from '../components/ShopFormSheet';
import { ShopStatusBadge } from '../components/ShopStatusBadge';
import { ToggleShopDialog } from '../components/ToggleShopDialog';
import { useShopLookups } from '../hooks/useShopLookups';
import { useShops } from '../hooks/useShops';

const PAGE_SIZE = 20;
type StatusFilter = 'active' | 'inactive' | '';

export function ShopsPage() {
  const lookups = useShopLookups();
  const [search, setSearch] = useState('');
  const [areaId, setAreaId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [orderBookerId, setOrderBookerId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState<ShopSheetMode | null>(null);
  const [toggling, setToggling] = useState<Shop | null>(null);

  const q = useDebouncedValue(search.trim());
  const params: ListShopsQueryInput = {
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    areaId: areaId || undefined,
    categoryId: categoryId || undefined,
    orderBookerId: orderBookerId || undefined,
    status: status || undefined,
  };
  const shops = useShops(params);
  const filtered = Boolean(q || areaId || categoryId || orderBookerId || status);

  /** Changing any filter goes back to page 1. */
  const onFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const columns = useMemo<ColumnDef<Shop, unknown>[]>(
    () => [
      {
        header: 'Shop',
        cell: ({ row }) => (
          <Link
            to={`/shops/${row.original.id}`}
            className="font-medium hover:text-primary hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      { header: 'Area', cell: ({ row }) => row.original.area.name },
      { header: 'Shop category', cell: ({ row }) => row.original.category?.name ?? '—' },
      {
        header: 'Order booker',
        cell: ({ row }) =>
          row.original.assignedOrderBooker?.name ?? (
            <span className="text-muted-foreground">Unassigned</span>
          ),
      },
      {
        header: 'Phone',
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.phone ?? '—'}</span>,
      },
      { header: 'Status', cell: ({ row }) => <ShopStatusBadge isActive={row.original.isActive} /> },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <ShopActions
            shop={row.original}
            onEdit={() => setSheet({ kind: 'edit', shop: row.original })}
            onToggle={() => setToggling(row.original)}
          />
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Shops"
        description="Your customers, grouped by area and assigned to order bookers."
        actions={
          <Button onClick={() => setSheet({ kind: 'create' })}>
            <Plus />
            Add shop
          </Button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_repeat(4,minmax(9rem,auto))]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, contact person or phone"
            className="pl-9"
            value={search}
            aria-label="Search shops"
            onChange={(e) => onFilter(setSearch)(e.target.value)}
          />
        </div>
        <NativeSelect
          value={areaId}
          aria-label="Area"
          onChange={(e) => onFilter(setAreaId)(e.target.value)}
        >
          <option value="">All areas</option>
          {lookups.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={categoryId}
          aria-label="Shop category"
          onChange={(e) => onFilter(setCategoryId)(e.target.value)}
        >
          <option value="">All categories</option>
          {lookups.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={orderBookerId}
          aria-label="Order booker"
          onChange={(e) => onFilter(setOrderBookerId)(e.target.value)}
        >
          <option value="">All order bookers</option>
          <option value={UNASSIGNED}>Unassigned</option>
          {lookups.bookers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status}
          aria-label="Status"
          onChange={(e) => onFilter((v) => setStatus(v as StatusFilter))(e.target.value)}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NativeSelect>
      </div>

      <DataTable
        columns={columns}
        data={shops.data?.items}
        isLoading={shops.isPending}
        error={shops.isError ? 'Could not load shops. Please try again.' : null}
        emptyMessage={
          filtered ? (
            'No shops match these filters.'
          ) : (
            <span className="flex flex-col items-center gap-2">
              <Store className="size-6" />
              No shops yet. Add your first shop.
            </span>
          )
        }
        getRowId={(s) => s.id}
        pagination={
          shops.data
            ? { page, pageSize: PAGE_SIZE, total: shops.data.total, onPageChange: setPage }
            : undefined
        }
        renderMobileCard={(s) => (
          <div className="flex items-start justify-between gap-3">
            <Link to={`/shops/${s.id}`} className="min-w-0 flex-1 space-y-1">
              <div className="font-medium">{s.name}</div>
              <div className="text-sm text-muted-foreground">
                {s.area.name}
                {s.category && ` · ${s.category.name}`}
              </div>
              <div className="text-sm text-muted-foreground">
                {s.assignedOrderBooker?.name ?? 'Unassigned'}
                {s.phone && ` · ${s.phone}`}
              </div>
              <div className="pt-1">
                <ShopStatusBadge isActive={s.isActive} />
              </div>
            </Link>
            <ShopActions
              shop={s}
              onEdit={() => setSheet({ kind: 'edit', shop: s })}
              onToggle={() => setToggling(s)}
            />
          </div>
        )}
      />

      <ShopFormSheet mode={sheet} onClose={() => setSheet(null)} />
      <ToggleShopDialog shop={toggling} onClose={() => setToggling(null)} />
    </>
  );
}

function ShopActions({
  shop,
  onEdit,
  onToggle,
}: {
  shop: Shop;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" asChild title="View details">
        <Link to={`/shops/${shop.id}`} aria-label={`View ${shop.name}`}>
          <Eye />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onEdit}
        aria-label={`Edit ${shop.name}`}
        title="Edit"
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label={`${shop.isActive ? 'Deactivate' : 'Activate'} ${shop.name}`}
        title={shop.isActive ? 'Deactivate' : 'Activate'}
        className={
          shop.isActive
            ? 'text-destructive hover:text-destructive'
            : 'text-primary hover:text-primary'
        }
      >
        <Power />
      </Button>
    </div>
  );
}
