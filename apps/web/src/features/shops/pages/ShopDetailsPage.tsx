import { type Shop } from '@mytraders/shared-types';
import { ArrowLeft, Banknote, FilePlus, Pencil, Power, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api/client';
import { ShopInvoiceHistory } from '@/features/invoices/components/ShopInvoiceHistory';
import { AdjustCreditDialog } from '@/features/ledger/components/AdjustCreditDialog';
import {
  type PaymentTarget,
  RecordPaymentDialog,
} from '@/features/ledger/components/RecordPaymentDialog';
import { ShopLedgerHistory } from '@/features/ledger/components/ShopLedgerHistory';
import { formatDate } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { ShopFormSheet, type ShopSheetMode } from '../components/ShopFormSheet';
import { ShopStatusBadge } from '../components/ShopStatusBadge';
import { ToggleShopDialog } from '../components/ToggleShopDialog';
import { useShop } from '../hooks/useShops';

/** Dedicated shop page (docs/product-requirements.md §4.4–4.5): info, credit, ledger, invoices. */
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
  const [paying, setPaying] = useState<PaymentTarget | null>(null);
  const [adjusting, setAdjusting] = useState<PaymentTarget | null>(null);
  const currency = useCurrentUser().organization?.currency ?? '';
  const target: PaymentTarget = {
    shopId: shop.id,
    shopName: shop.name,
    outstandingBalance: shop.outstandingBalance,
  };
  const owes = shop.outstandingBalance !== '0.00' && !shop.outstandingBalance.startsWith('-');

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
        <div className="flex flex-wrap gap-2">
          {shop.isActive && (
            <Button asChild>
              <Link to={`/shops/${shop.id}/invoices/new`}>
                <FilePlus />
                Generate invoice
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => setToggling(shop)}>
            <Power />
            {shop.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button variant="outline" onClick={() => setSheet({ kind: 'edit', shop })}>
            <Pencil />
            Edit shop
          </Button>
        </div>
      </div>

      <Card className="mb-4 py-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 px-5">
          <div>
            <div className="text-sm text-muted-foreground">Current outstanding</div>
            <div
              className="text-3xl font-semibold tracking-tight tabular-nums"
              data-testid="outstanding"
            >
              {currency} {formatAmount(shop.outstandingBalance)}
            </div>
            <div className="text-xs text-muted-foreground">
              From the shop ledger (invoices − payments ± adjustments).
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPaying(target)} disabled={!owes}>
              <Banknote />
              Record payment
            </Button>
            <Button variant="outline" onClick={() => setAdjusting(target)}>
              <SlidersHorizontal />
              Adjust credit
            </Button>
          </div>
        </CardContent>
      </Card>

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

        <ShopLedgerHistory shopId={shop.id} />
        <ShopInvoiceHistory shopId={shop.id} canInvoice={shop.isActive} />
      </div>

      <ShopFormSheet mode={sheet} onClose={() => setSheet(null)} />
      <ToggleShopDialog shop={toggling} onClose={() => setToggling(null)} />
      <RecordPaymentDialog target={paying} onClose={() => setPaying(null)} />
      <AdjustCreditDialog target={adjusting} onClose={() => setAdjusting(null)} />
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
