import { type Product } from '@mytraders/shared-types';
import { PackageSearch, Search } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useProducts } from '@/features/products/hooks/useProducts';
import { formatAmount } from '@/lib/format/number';
import { weightLabel } from '@/lib/format/product';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

/** Search active products to add to (or swap on) an invoice row. */
export function ProductPickerDialog({
  open,
  title,
  onPick,
  onClose,
  usedIds,
}: {
  open: boolean;
  title: string;
  onPick: (product: Product) => void;
  onClose: () => void;
  usedIds: ReadonlySet<string>;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        {open && <PickerBody title={title} onPick={onPick} usedIds={usedIds} />}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  title,
  onPick,
  usedIds,
}: {
  title: string;
  onPick: (product: Product) => void;
  usedIds: ReadonlySet<string>;
}) {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());
  const products = useProducts({ q: q || undefined, status: 'active', pageSize: 30 });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Active products. Prices fill in from the product.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-9"
          placeholder="Search product name or code"
          aria-label="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-96 overflow-y-auto rounded-md border">
        {products.isPending ? (
          <Skeleton className="m-3 h-32" />
        ) : products.isError ? (
          <p className="p-4 text-center text-sm text-destructive">Could not load products.</p>
        ) : products.data.items.length === 0 ? (
          <p className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <PackageSearch className="size-6" />
            No active products found.
          </p>
        ) : (
          <ul className="divide-y">
            {products.data.items.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={() => onPick(product)}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {product.name}
                      {usedIds.has(product.id) && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (already on invoice)
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{product.type}</Badge>
                      {product.code && <span className="font-mono">{product.code}</span>}
                      {product.weight && <span>{weightLabel(product)}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums">
                    {formatAmount(product.tradePrice)}
                    <span className="block text-xs text-muted-foreground">
                      T.P / {product.type === 'POUCH' ? 'ctn' : 'pc'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
