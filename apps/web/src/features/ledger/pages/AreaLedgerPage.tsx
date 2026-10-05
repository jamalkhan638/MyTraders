import { type AreaLedger, type AreaLedgerRow } from '@mytraders/shared-types';
import { Banknote, ChevronLeft, ChevronRight, Download, Printer, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAreas } from '@/features/areas/hooks/useAreas';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatBusinessDate, shiftDate, todayIn } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';
import { type PaymentTarget, RecordPaymentDialog } from '../components/RecordPaymentDialog';
import { useAreaLedger } from '../hooks/useLedger';

const owes = (balance: string) => balance !== '0.00' && !balance.startsWith('-');

/** "+1,000.00" / "−500.00" / "" — invoices and adjustments on the date, shown so closing adds up. */
function dayActivity(row: Pick<AreaLedgerRow, 'dayDebit' | 'dayOtherCredit'>): string {
  const parts = [
    row.dayDebit !== '0.00' && `+${formatAmount(row.dayDebit)}`,
    row.dayOtherCredit !== '0.00' && `−${formatAmount(row.dayOtherCredit)}`,
  ].filter(Boolean);
  return parts.join(' ');
}

/** Byte-order mark so Excel reads the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** Collection sheet as CSV (opens in Excel). Values are the server's decimal strings. */
function downloadCsv(sheet: AreaLedger) {
  const header = [
    'Shop',
    'Opening balance',
    'Invoices / adjustments (+)',
    'Other credits (-)',
    'Payment',
    'Closing balance',
    'Last payment',
  ];
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    [`Area ledger — ${sheet.area.name} — ${sheet.date}`],
    header,
    ...sheet.rows.map((r) => [
      r.shop.name,
      r.openingBalance,
      r.dayDebit,
      r.dayOtherCredit,
      r.payments,
      r.closingBalance,
      r.lastPaymentDate ?? '',
    ]),
    [
      'Total',
      sheet.totals.openingBalance,
      sheet.totals.dayDebit,
      sheet.totals.dayOtherCredit,
      sheet.totals.payments,
      sheet.totals.closingBalance,
      '',
    ],
  ].map((cells) => cells.map(quote).join(','));
  const blob = new Blob([`${BOM}${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `area-ledger-${sheet.area.name.replace(/\W+/g, '-')}-${sheet.date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Finance → Area Ledger: the digital area collection sheet. Everything is computed by the server
 * from shop ledger entries for the chosen date; a payment entered here is a normal shop payment.
 */
export function AreaLedgerPage() {
  const user = useCurrentUser();
  const currency = user.organization?.currency ?? '';
  const today = todayIn(user.organization?.timezone);
  const [params, setParams] = useSearchParams();
  const areas = useAreas({ status: 'active', pageSize: 100 });
  const areaId = params.get('areaId') ?? areas.data?.items[0]?.id ?? '';
  const date = params.get('date') ?? today;
  const [search, setSearch] = useState('');
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);
  const q = useDebouncedValue(search.trim());
  const sheet = useAreaLedger(areaId, {
    date,
    q: q || undefined,
    outstandingOnly: outstandingOnly ? 'true' : undefined,
  });

  const update = (patch: Record<string, string>) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) next.set(key, value);
      if (!next.get('areaId') && areaId) next.set('areaId', areaId);
      return next;
    });

  return (
    <div className="area-ledger">
      <div className="mb-2 hidden print:block">
        <div className="text-lg font-bold">{user.organization?.name}</div>
        <div className="text-sm">Area collection sheet</div>
      </div>
      <div className="print:hidden">
        <PageHeader
          title="Area ledger"
          description="Collection sheet per area and date, from each shop's ledger. Payments entered here are normal shop payments."
          actions={
            sheet.data && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => downloadCsv(sheet.data)}>
                  <Download />
                  Excel (CSV)
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer />
                  Print / PDF
                </Button>
              </div>
            )
          }
        />
        <div className="mb-4 grid gap-2 md:grid-cols-[minmax(10rem,14rem)_auto_1fr_auto]">
          <NativeSelect
            aria-label="Area"
            value={areaId}
            onChange={(e) => update({ areaId: e.target.value })}
          >
            {areas.data?.items.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </NativeSelect>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous day"
              onClick={() => update({ date: shiftDate(date, -1) })}
            >
              <ChevronLeft />
            </Button>
            <Input
              type="date"
              aria-label="Date"
              className="w-40"
              value={date}
              onChange={(e) => e.target.value && update({ date: e.target.value })}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Next day"
              onClick={() => update({ date: shiftDate(date, 1) })}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update({ date: today })}
              disabled={date === today}
            >
              Today
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search shop"
              aria-label="Search shop"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <input
              type="checkbox"
              checked={outstandingOnly}
              onChange={(e) => setOutstandingOnly(e.target.checked)}
            />
            Only shops with a balance
          </label>
        </div>
      </div>

      {areas.data && areas.data.items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No active areas. Add one in Settings → Areas.
          </CardContent>
        </Card>
      ) : sheet.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : sheet.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Could not load the area ledger.
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0 print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 print:px-0">
            <h2 className="font-semibold">
              {sheet.data.area.name}{' '}
              <span className="font-normal text-muted-foreground">
                · {formatBusinessDate(sheet.data.date)}
              </span>
            </h2>
            <span className="text-xs text-muted-foreground">
              {sheet.data.rows.length} shop{sheet.data.rows.length === 1 ? '' : 's'} · amounts in{' '}
              {currency}
            </span>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm print:min-w-0 print:text-[11px]">
              <thead className="bg-muted/60 text-xs text-muted-foreground print:bg-transparent print:text-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-right [&>th]:font-medium">
                  <th className="!text-left">Shop</th>
                  <th>Previous</th>
                  <th title="Invoices and adjustments on this date">Invoices / adj.</th>
                  <th>Payment</th>
                  <th>Remaining</th>
                  <th className="!text-left">Last payment</th>
                  <th className="print:hidden">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sheet.data.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      No shops match.
                    </td>
                  </tr>
                )}
                {sheet.data.rows.map((row) => (
                  <tr key={row.shop.id} className="[&>td]:px-3 [&>td]:py-2 [&>td]:tabular-nums">
                    <td>
                      <Link to={`/shops/${row.shop.id}`} className="font-medium hover:underline">
                        {row.shop.name}
                      </Link>
                      {!row.shop.isActive && (
                        <span className="ml-1 text-xs text-destructive">(inactive)</span>
                      )}
                    </td>
                    <td className="text-right">{formatAmount(row.openingBalance)}</td>
                    <td className="text-right text-muted-foreground">{dayActivity(row)}</td>
                    <td
                      className={cn(
                        'text-right',
                        row.payments !== '0.00' && 'font-medium text-primary',
                      )}
                    >
                      {row.payments !== '0.00' ? formatAmount(row.payments) : '0'}
                    </td>
                    <td className="text-right font-semibold">{formatAmount(row.closingBalance)}</td>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {row.lastPaymentDate ? formatBusinessDate(row.lastPaymentDate) : '—'}
                    </td>
                    <td className="text-right print:hidden">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!owes(row.currentBalance) || date > today}
                        onClick={() =>
                          setPaying({
                            shopId: row.shop.id,
                            shopName: row.shop.name,
                            outstandingBalance: row.currentBalance,
                            date,
                          })
                        }
                        aria-label={`Record payment for ${row.shop.name}`}
                      >
                        <Banknote />
                        Payment
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t-2 font-semibold [&>td]:px-3 [&>td]:py-2.5 [&>td]:text-right [&>td]:tabular-nums"
                  data-testid="area-totals"
                >
                  <td className="!text-left">Total</td>
                  <td>{formatAmount(sheet.data.totals.openingBalance)}</td>
                  <td className="text-muted-foreground">{dayActivity(sheet.data.totals)}</td>
                  <td>{formatAmount(sheet.data.totals.payments)}</td>
                  <td>{formatAmount(sheet.data.totals.closingBalance)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground print:px-0">
            Previous = balance before this date · Remaining = balance after everything on this date
            (invoices, adjustments, payments). From the shop ledger only.
          </p>
        </Card>
      )}

      <RecordPaymentDialog target={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
