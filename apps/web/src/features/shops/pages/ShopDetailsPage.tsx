import { type Shop } from '@mytraders/shared-types';
import { ArrowLeft, Clock, FileText, Pencil, Power, Wallet } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api/client';
import { formatDate } from '@/lib/format/date';
import { ShopFormSheet, type ShopSheetMode } from '../components/ShopFormSheet';
import { ShopStatusBadge } from '../components/ShopStatusBadge';
import { ToggleShopDialog } from '../components/ToggleShopDialog';
import { useShop } from '../hooks/useShops';

/** Dedicated shop page (docs/product-requirements.md §4.4). Ledger/invoice sections arrive in Phases 4–5. */
export function ShopDetailsPage() {
  const { id = '' } = useParams();
  const shop = useShop(id);

  return (
    <div className="max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
        <Link to="/shops">
          <ArrowLeft />
          All shops
        </Link>
      </Button>
      {shop.isPending ? (
        <DetailsSkeleton />
      ) : shop.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm">
            {shop.error instanceof ApiError && shop.error.status === 404 ? (
              <span className="text-muted-foreground">
                This shop does not exist or is not part of your company.
              </span>
            ) : (
              <span className="text-destructive">Could not load this shop. Please try again.</span>
            )}
          </CardContent>
        </Card>
      ) : (
        <ShopDetails shop={shop.data} />
      )}
    </div>
  );
}

function ShopDetails({ shop }: { shop: Shop }) {
  const timeZone = useCurrentUser().organization?.timezone;
  const [sheet, setSheet] = useState<ShopSheetMode | null>(null);
  const [toggling, setToggling] = useState<Shop | null>(null);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{shop.name}</h1>
            <ShopStatusBadge isActive={shop.isActive} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {shop.area.name}
            {shop.category && ` · ${shop.category.name}`} · Added{' '}
            {formatDate(shop.createdAt, timeZone)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setToggling(shop)}>
            <Power />
            {shop.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button onClick={() => setSheet({ kind: 'edit', shop })}>
            <Pencil />
            Edit shop
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Shop information</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoList
              rows={[
                ['Owner / contact person', shop.contactPerson],
                ['Phone', shop.phone],
                ['Address', shop.address],
                [
                  'Area',
                  <>
                    {shop.area.name}
                    {!shop.area.isActive && <Inactive />}
                  </>,
                ],
                [
                  'Shop category',
                  shop.category ? (
                    <>
                      {shop.category.name}
                      {!shop.category.isActive && <Inactive />}
                    </>
                  ) : null,
                ],
                [
                  'Order booker',
                  shop.assignedOrderBooker ? (
                    <>
                      {shop.assignedOrderBooker.name}
                      {!shop.assignedOrderBooker.isActive && <Inactive />}
                    </>
                  ) : (
                    'Unassigned'
                  ),
                ],
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax information</CardTitle>
            <CardDescription>Printed on invoices.</CardDescription>
          </CardHeader>
          <CardContent>
            <InfoList
              rows={[
                ['NTN', shop.ntn],
                ['STRN', shop.strn],
                ['CNIC', shop.cnic],
              ]}
            />
          </CardContent>
        </Card>

        <Upcoming
          icon={<Wallet />}
          title="Outstanding credit"
          note="Shown here once the shop ledger is built (Phase 5)."
        />
        <Upcoming
          icon={<FileText />}
          title="Invoice history"
          note="Every invoice for this shop, with its date, will be listed here (Phase 4)."
        />
        <Upcoming
          icon={<Clock />}
          title="Payment / credit history"
          note="Payments received and credit added will be listed here (Phase 5)."
        />
      </div>

      <ShopFormSheet mode={sheet} onClose={() => setSheet(null)} />
      <ToggleShopDialog shop={toggling} onClose={() => setToggling(null)} />
    </>
  );
}

function InfoList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium break-words">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Inactive() {
  return <span className="ml-1.5 text-xs font-normal text-destructive">(inactive)</span>;
}

function Upcoming({ icon, title, note }: { icon: ReactNode; title: string; note: string }) {
  return (
    <Card className="border-dashed shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 lg:col-span-2" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
