import { type BookerShop } from '@mytraders/shared-types';
import { ClipboardPlus, MapPin, Search, Store } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { useMyAreas, useMyShops } from '../hooks/useBooker';

/** My Shops: only active shops assigned to me, grouped by area (docs §4.7). */
export function BookerShopsPage() {
  const [search, setSearch] = useState('');
  const [areaId, setAreaId] = useState('');
  const q = useDebouncedValue(search.trim());
  const areas = useMyAreas();
  const shops = useMyShops({ pageSize: 50, q: q || undefined, areaId: areaId || undefined });
  const items = shops.data?.pages.flatMap((page) => page.items) ?? [];
  const total = shops.data?.pages[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My Shops</h1>
        <p className="text-sm text-muted-foreground">
          Shops assigned to you. Tap a shop to book an order.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          placeholder="Search shop name"
          value={search}
          aria-label="Search my shops"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        role="group"
        aria-label="Filter by area"
      >
        <AreaChip active={areaId === ''} onClick={() => setAreaId('')}>
          All areas
        </AreaChip>
        {areas.data?.map((area) => (
          <AreaChip key={area.id} active={areaId === area.id} onClick={() => setAreaId(area.id)}>
            {area.name} <span className="opacity-70">{area.shopCount}</span>
          </AreaChip>
        ))}
      </div>

      {shops.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : shops.isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            Could not load your shops. Pull to retry.
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Store className="size-7" />
            {q || areaId
              ? 'No shops match your search.'
              : 'No shops are assigned to you yet. Ask your admin.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {total} shop{total === 1 ? '' : 's'}
          </p>
          {items.map((shop, index) => (
            <Fragment key={shop.id}>
              {(index === 0 || items[index - 1].area.id !== shop.area.id) && (
                <h2 className="flex items-center gap-1.5 pt-2 text-sm font-semibold text-muted-foreground">
                  <MapPin className="size-4" />
                  {shop.area.name}
                </h2>
              )}
              <ShopCard shop={shop} />
            </Fragment>
          ))}
          {shops.hasNextPage && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void shops.fetchNextPage()}
              disabled={shops.isFetchingNextPage}
            >
              Load more shops
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ShopCard({ shop }: { shop: BookerShop }) {
  const detail = [shop.contactPerson, shop.phone].filter(Boolean).join(' · ');
  return (
    <Card className="gap-3 py-4">
      <CardContent className="space-y-3 px-4">
        <div>
          <div className="text-base font-semibold">{shop.name}</div>
          {shop.address && <div className="text-sm text-muted-foreground">{shop.address}</div>}
          {detail && <div className="text-sm text-muted-foreground">{detail}</div>}
        </div>
        <Button asChild size="lg" className="w-full">
          <Link to={`/booker/shops/${shop.id}/order`}>
            <ClipboardPlus />
            Book order
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function AreaChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground',
      )}
    >
      {children}
    </button>
  );
}
