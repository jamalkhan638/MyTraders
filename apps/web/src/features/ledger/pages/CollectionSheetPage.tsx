import { type ShopCreditReport } from '@mytraders/shared-types';
import { Download, Printer, Search } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAreas } from '@/features/areas/hooks/useAreas';
import { useCurrentUser } from '@/features/auth/auth-context';
import { useReport } from '@/features/reports/api/reports.api';
import { downloadCsv, slug } from '@/lib/export/csv';
import { formatBusinessDate, formatDateTime, todayIn } from '@/lib/format/date';
import { formatAmount, plural } from '@/lib/format/number';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

type Row = ShopCreditReport['rows'][number];

/**
 * Finance → Collection Sheet: a printable register for market collection. The Admin picks an area
 * and prints; the collector writes Payment and Remaining Balance by hand. Read-only — payments are
 * entered from Shop Details. Balance = current Shop Ledger outstanding, Bill Date = latest confirmed
 * invoice, Area = the shop's current area (all from GET /reports/shop-credit, no new formula).
 */
export function CollectionSheetPage() {
  const user = useCurrentUser();
  const currency = user.organization?.currency ?? '';
  const [params, setParams] = useSearchParams();
  const areas = useAreas({ status: 'active', pageSize: 100 });
  const areaId = params.get('areaId') ?? areas.data?.items[0]?.id ?? '';
  const areaName = areas.data?.items.find((a) => a.id === areaId)?.name ?? '';
  const [search, setSearch] = useState('');
  const [owingOnly, setOwingOnly] = useState(false);
  const q = useDebouncedValue(search.trim());
  const sheet = useReport<ShopCreditReport>(
    'shop-credit',
    areaId ? { areaId, q: q || undefined, balance: owingOnly ? 'owing' : 'all' } : null,
  );
  // Inactive shops stay on the sheet only while they still owe something; ordered by name.
  const rows = (sheet.data?.rows ?? [])
    .filter((r) => r.shop.isActive || r.outstanding !== '0.00')
    .sort((a, b) => a.shop.name.localeCompare(b.shop.name));
  // the server's Σ outstanding of the matching shops (the hidden rows are zero balances)
  const totalBalance = sheet.data?.totals.outstanding ?? '0.00';

  const exportCsv = () =>
    downloadCsv(`collection-sheet-${slug(areaName)}-${todayIn(user.organization?.timezone)}`, [
      [`Collection sheet — ${areaName}`, `Printed ${todayIn(user.organization?.timezone)}`],
      ['Shop name', `Balance (${currency})`, 'Payment', 'Remaining balance', 'Bill date', 'Area'],
      ...rows.map((r: Row) => [
        r.shop.name,
        r.outstanding,
        '',
        '',
        r.lastInvoiceDate ?? '',
        r.area.name,
      ]),
      ['Total', totalBalance, '', '', '', ''],
    ]);

  return (
    <div className="collection-sheet">
      <div className="mb-3 hidden print:block">
        <div className="text-xl font-bold">{user.organization?.name}</div>
        <div className="mt-1 flex justify-between text-sm">
          <span>
            Collection sheet · Area: <strong>{areaName}</strong>
          </span>
          <span>
            Printed {formatDateTime(new Date().toISOString(), user.organization?.timezone)}
          </span>
        </div>
      </div>

      <div className="print:hidden">
        <PageHeader
          title="Area Collection Sheet"
          description="Choose an area and print the sheet for the collector. Payment and Remaining Balance are left blank to fill in by hand. Record actual payments from the shop's page."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                <Download />
                Excel (CSV)
              </Button>
              <Button onClick={() => window.print()} disabled={rows.length === 0}>
                <Printer />
                Print / PDF
              </Button>
            </div>
          }
        />
        <div className="mb-4 grid gap-2 md:grid-cols-[minmax(10rem,16rem)_1fr_auto] md:items-center">
          <NativeSelect
            aria-label="Area"
            value={areaId}
            onChange={(e) => setParams({ areaId: e.target.value }, { replace: true })}
          >
            {areas.data?.items.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </NativeSelect>
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
              checked={owingOnly}
              onChange={(e) => setOwingOnly(e.target.checked)}
            />
            Only shops with outstanding balance
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
            Could not load the collection sheet.
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0 print:rounded-none print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 print:hidden">
            <h2 className="font-semibold">{areaName}</h2>
            <span className="text-xs text-muted-foreground">
              {plural(rows.length, 'shop')} · amounts in {currency}
            </span>
          </div>
          <div className="relative overflow-x-auto print:overflow-visible">
            <table className="sheet-table w-full min-w-[760px] text-sm print:min-w-0">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="text-left">Shop name</th>
                  <th className="text-right">Balance</th>
                  <th className="text-left">Payment</th>
                  <th className="text-left">Remaining balance</th>
                  <th className="text-left">Bill date</th>
                  <th className="text-left">Area</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No shops match.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.shop.id}>
                    <td className="font-medium">
                      {r.shop.name}
                      {!r.shop.isActive && (
                        <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {formatAmount(r.outstanding)}
                    </td>
                    {/* left blank on purpose: written by hand after collection */}
                    <td aria-label="Payment (write by hand)" />
                    <td aria-label="Remaining balance (write by hand)" />
                    <td className="whitespace-nowrap">{formatBusinessDate(r.lastInvoiceDate)}</td>
                    <td>{r.area.name}</td>
                  </tr>
                ))}
                {/* the total is the last body row: a <tfoot> on a named print page makes Chrome
                    break the page before it */}
                {rows.length > 0 && (
                  <tr className="sheet-total font-semibold">
                    <td>Total ({plural(rows.length, 'shop')})</td>
                    <td className="text-right tabular-nums" data-testid="sheet-total">
                      {formatAmount(totalBalance)}
                    </td>
                    <td />
                    <td />
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="hidden justify-between gap-8 pt-10 text-sm print:flex">
            <span>Collector: ______________________</span>
            <span>Signature: ______________________</span>
            <span>Date: ______________</span>
          </div>
        </Card>
      )}
    </div>
  );
}
