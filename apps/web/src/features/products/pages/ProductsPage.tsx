import { type ListProductsQueryInput, type Product } from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import { Package, Pencil, Plus, Power, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatAmount } from '@/lib/format/number';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { weightWithUnit } from '../components/product-display';
import { ProductFormSheet, type ProductSheetMode } from '../components/ProductFormSheet';
import { ToggleProductDialog } from '../components/ToggleProductDialog';
import { useProducts } from '../hooks/useProducts';

const PAGE_SIZE = 20;
type StatusFilter = 'active' | 'inactive' | '';

export function ProductsPage() {
  const currency = useCurrentUser().organization?.currency ?? '';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState<ProductSheetMode | null>(null);
  const [toggling, setToggling] = useState<Product | null>(null);

  const q = useDebouncedValue(search.trim());
  const params: ListProductsQueryInput = {
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
  };
  const products = useProducts(params);
  const filtered = Boolean(q || status);

  const columns = useMemo<ColumnDef<Product, unknown>[]>(() => {
    const amount = (
      header: string,
      key: 'retailPrice' | 'tradePrice' | 'costPrice',
    ): ColumnDef<Product, unknown> => ({
      header: () => <span className="block text-right">{header}</span>,
      id: key,
      cell: ({ row }) => (
        <span className="block text-right tabular-nums">{formatAmount(row.original[key])}</span>
      ),
    });
    return [
      {
        header: 'Product',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        header: 'Code',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.code ?? '—'}
          </span>
        ),
      },
      amount(`Retail (${currency})`, 'retailPrice'),
      amount(`Trade (${currency})`, 'tradePrice'),
      amount(`Cost (${currency})`, 'costPrice'),
      { header: 'Weight / Unit', cell: ({ row }) => weightWithUnit(row.original) },
      {
        header: () => <span className="block text-right">Pcs / ctn</span>,
        id: 'piecesPerCarton',
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.piecesPerCarton ?? '—'}
          </span>
        ),
      },
      {
        header: 'Status',
        cell: ({ row }) => <ProductStatusBadge isActive={row.original.isActive} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <ProductActions
            product={row.original}
            onEdit={() => setSheet({ kind: 'edit', product: row.original })}
            onToggle={() => setToggling(row.original)}
          />
        ),
      },
    ];
  }, [currency]);

  return (
    <>
      <PageHeader
        title="Products"
        description="What you sell. Prices are per selling unit (e.g. one carton)."
        actions={
          <Button onClick={() => setSheet({ kind: 'create' })}>
            <Plus />
            Add product
          </Button>
        }
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by product name or code"
            className="pl-9"
            value={search}
            aria-label="Search products"
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
        data={products.data?.items}
        isLoading={products.isPending}
        error={products.isError ? 'Could not load products. Please try again.' : null}
        emptyMessage={
          filtered ? (
            'No products match these filters.'
          ) : (
            <span className="flex flex-col items-center gap-2">
              <Package className="size-6" />
              No products yet. Add your first product.
            </span>
          )
        }
        getRowId={(p) => p.id}
        pagination={
          products.data
            ? { page, pageSize: PAGE_SIZE, total: products.data.total, onPageChange: setPage }
            : undefined
        }
        renderMobileCard={(p) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="font-medium">{p.name}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {p.code && <span className="font-mono">{p.code}</span>}
                <span>{weightWithUnit(p)}</span>
                {p.piecesPerCarton && <span>{p.piecesPerCarton} pcs/ctn</span>}
                <ProductStatusBadge isActive={p.isActive} />
              </div>
              <dl className="grid grid-cols-3 gap-2 pt-1 text-xs">
                {(
                  [
                    ['Retail', p.retailPrice],
                    ['Trade', p.tradePrice],
                    ['Cost', p.costPrice],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium tabular-nums">{formatAmount(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <ProductActions
              product={p}
              onEdit={() => setSheet({ kind: 'edit', product: p })}
              onToggle={() => setToggling(p)}
            />
          </div>
        )}
      />

      <ProductFormSheet mode={sheet} onClose={() => setSheet(null)} />
      <ToggleProductDialog product={toggling} onClose={() => setToggling(null)} />
    </>
  );
}

function ProductStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge>Active</Badge> : <Badge variant="destructive">Inactive</Badge>;
}

function ProductActions({
  product,
  onEdit,
  onToggle,
}: {
  product: Product;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onEdit}
        aria-label={`Edit ${product.name}`}
        title="Edit"
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label={`${product.isActive ? 'Deactivate' : 'Activate'} ${product.name}`}
        title={product.isActive ? 'Deactivate' : 'Activate'}
        className={
          product.isActive
            ? 'text-destructive hover:text-destructive'
            : 'text-primary hover:text-primary'
        }
      >
        <Power />
      </Button>
    </div>
  );
}
