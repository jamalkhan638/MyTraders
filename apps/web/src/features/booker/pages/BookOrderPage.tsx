import { type BookerProduct, quantityUnitFor } from '@mytraders/shared-types';
import { ArrowLeft, Check, Loader2, PackageSearch, Plus, Search, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCreateOrder } from '@/features/orders/hooks/useOrders';
import { ApiError } from '@/lib/api/client';
import { showApiError } from '@/lib/api/form-errors';
import { quantityLabel, quantityTotals, weightLabel } from '@/lib/format/product';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { QuantityStepper } from '../components/QuantityStepper';
import { useBookerProducts, useMyShop } from '../hooks/useBooker';
import { type DraftLine, useOrderDraft } from '../hooks/useOrderDraft';

function describe(
  product: Pick<BookerProduct, 'code' | 'type' | 'weight' | 'weightUnit' | 'weightBasis'>,
): string {
  const size = product.weight ? weightLabel(product) : null;
  return [product.code, product.type, size].filter(Boolean).join(' · ');
}

/**
 * Book Order (docs §4.7): products and whole quantities only — no prices, tax, discount or
 * payment (D-24). The server re-checks the shop, the products and the quantities.
 */
export function BookOrderPage() {
  const { shopId = '' } = useParams();
  const shop = useMyShop(shopId);

  if (shop.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (shop.isError) {
    const notMine = shop.error instanceof ApiError && shop.error.status === 404;
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center text-sm">
          <p className={notMine ? 'text-muted-foreground' : 'text-destructive'}>
            {notMine
              ? 'This shop is not one of your active shops.'
              : 'Could not load this shop. Please try again.'}
          </p>
          <Button asChild variant="outline">
            <Link to="/booker/shops">Back to My Shops</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <BookOrderForm shopId={shopId} shopName={shop.data.name} areaName={shop.data.area.name} />;
}

function BookOrderForm({
  shopId,
  shopName,
  areaName,
}: {
  shopId: string;
  shopName: string;
  areaName: string;
}) {
  const navigate = useNavigate();
  const draft = useOrderDraft(shopId);
  const create = useCreateOrder();
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const q = useDebouncedValue(search.trim());
  const products = useBookerProducts({ q: q || undefined, pageSize: 30 });
  const inOrder = new Map(draft.lines.map((line) => [line.product.id, line]));
  // Pieces (TIN) and cartons (POUCH) are counted separately, never added together (D-28).
  const totals = { totalPieces: 0, totalCartons: 0 };
  for (const line of draft.lines) {
    if (quantityUnitFor(line.product.type) === 'CARTON') totals.totalCartons += line.quantity;
    else totals.totalPieces += line.quantity;
  }

  const submit = () => {
    if (draft.lines.length === 0) return;
    create.mutate(
      {
        shopId,
        items: draft.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (order) => {
          draft.clear();
          toast.success(`Order ${order.orderNumber} submitted`);
          navigate(`/booker/orders/${order.id}?submitted=1`, { replace: true });
        },
        onError: (error) => showApiError(error),
      },
    );
  };

  return (
    <div className="space-y-4 pb-28">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/booker/shops">
            <ArrowLeft />
            My Shops
          </Link>
        </Button>
        <h1 className="mt-1 text-xl font-semibold">{shopName}</h1>
        <p className="text-sm text-muted-foreground">{areaName} · New order</p>
      </div>

      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">
            Your order{' '}
            <span className="font-normal text-muted-foreground">
              ({draft.lines.length} product{draft.lines.length === 1 ? '' : 's'})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {draft.lines.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              Search below and tap “Add” to put products in this order.
            </p>
          ) : (
            <ul className="divide-y">
              {draft.lines.map((line) => (
                <OrderLine
                  key={line.product.id}
                  line={line}
                  onQuantity={(qty) => draft.setQuantity(line.product.id, qty)}
                  onRemove={() => draft.remove(line.product.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2" aria-label="Add products">
        <h2 className="text-sm font-semibold text-muted-foreground">Add products</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder="Search product name or code"
            value={search}
            aria-label="Search products"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {products.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : products.isError ? (
          <p className="py-4 text-center text-sm text-destructive">Could not load products.</p>
        ) : products.data.items.length === 0 ? (
          <p className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <PackageSearch className="size-6" />
            No products found.
          </p>
        ) : (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {products.data.items.map((product) => {
                const added = inOrder.has(product.id);
                return (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{product.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {describe(product) || '—'}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={added ? 'secondary' : 'outline'}
                      className="h-10 shrink-0"
                      disabled={added}
                      onClick={() => draft.add(product)}
                      aria-label={added ? `${product.name} added` : `Add ${product.name}`}
                    >
                      {added ? <Check /> : <Plus />}
                      {added ? 'Added' : 'Add'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-2">
        <label htmlFor="order-notes" className="text-sm font-semibold text-muted-foreground">
          Note (optional)
        </label>
        <Textarea
          id="order-notes"
          rows={2}
          maxLength={500}
          placeholder="e.g. deliver before Friday"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </section>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-screen-sm border-t bg-card/95 px-4 py-3 backdrop-blur">
        <Button
          size="lg"
          className="w-full"
          disabled={draft.lines.length === 0 || create.isPending}
          onClick={submit}
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : <Send />}
          {draft.lines.length === 0
            ? 'Add products to submit'
            : `Submit order · ${draft.lines.length} product${draft.lines.length === 1 ? '' : 's'} · ${quantityTotals(totals)}`}
        </Button>
      </div>
    </div>
  );
}

function OrderLine({
  line,
  onQuantity,
  onRemove,
}: {
  line: DraftLine;
  onQuantity: (qty: number) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{line.product.name}</div>
          <div className="text-xs text-muted-foreground">{describe(line.product) || '—'}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-destructive hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remove ${line.product.name}`}
        >
          <Trash2 />
        </Button>
      </div>
      <QuantityStepper
        value={line.quantity}
        onChange={onQuantity}
        label={line.product.name}
        unitLabel={quantityLabel(quantityUnitFor(line.product.type))}
      />
    </li>
  );
}
