import { AlertTriangle, Download, Printer } from 'lucide-react';
import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatDateTime } from '@/lib/format/date';

/**
 * Frame of every report: title, filters, Excel (CSV) and Print buttons, the print header (company,
 * report, period and filters) and the loading / error / "too many rows" states.
 */
export function ReportView({
  title,
  description,
  summary,
  filters,
  query,
  onCsv,
  truncated,
  rowCount,
  children,
}: {
  title: string;
  description: string;
  /** period and active filters, printed under the title */
  summary: string;
  filters: ReactNode;
  query: { isPending: boolean; isError: boolean; isFetching: boolean };
  onCsv?: () => void;
  truncated?: boolean;
  rowCount?: number;
  children: ReactNode;
}) {
  const user = useCurrentUser();
  return (
    <div className="report">
      <div className="mb-3 hidden print:block">
        <div className="text-lg font-bold">{user.organization?.name}</div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs">{summary}</div>
        <div className="text-[10px] text-muted-foreground">
          Printed {formatDateTime(new Date().toISOString(), user.organization?.timezone)}
        </div>
      </div>
      <div className="print:hidden">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCsv} disabled={!onCsv}>
              <Download />
              Excel (CSV)
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!onCsv}>
              <Printer />
              Print / PDF
            </Button>
          </div>
        </div>
        <div className="mb-4">{filters}</div>
      </div>
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Could not load the report. Check the filters and try again.
          </CardContent>
        </Card>
      ) : (
        <div className={query.isFetching ? 'opacity-70 transition-opacity' : undefined}>
          {truncated && (
            <p
              className="mb-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 print:hidden"
              role="status"
            >
              <AlertTriangle className="size-4 shrink-0" />
              Showing the first rows of {rowCount?.toLocaleString('en-US')}. Totals include every
              row — narrow the filters to list them all.
            </p>
          )}
          <p className="mb-2 text-xs text-muted-foreground print:hidden">{summary}</p>
          {children}
        </div>
      )}
    </div>
  );
}
