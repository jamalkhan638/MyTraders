import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface ReportColumn<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** totals row content */
  footer?: ReactNode;
  align?: 'right';
  className?: string;
}

/** Plain report table: scrolls sideways on phones, prints as a normal table. */
export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'Nothing matches these filters.',
  minWidth = 760,
  footerLabel = 'Total',
  testId,
}: {
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
  minWidth?: number;
  footerLabel?: string;
  testId?: string;
}) {
  const hasFooter = columns.some((c) => c.footer !== undefined);
  const align = (c: ReportColumn<T>) => (c.align === 'right' ? 'text-right' : 'text-left');
  return (
    <Card className="gap-0 py-0 print:border-0 print:shadow-none">
      <div className="relative overflow-x-auto">
        <table
          className="w-full text-sm print:!min-w-0 print:text-[10px]"
          style={{ minWidth }}
          data-testid={testId}
        >
          <thead className="bg-muted/60 text-xs text-muted-foreground print:bg-transparent print:text-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium print:[&>th]:px-1.5">
              {columns.map((c, i) => (
                <th key={i} className={cn(align(c), c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-muted-foreground"
                >
                  {empty}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="[&>td]:px-3 [&>td]:py-2 [&>td]:tabular-nums print:[&>td]:px-1.5 print:[&>td]:py-1"
              >
                {columns.map((c, i) => (
                  <td key={i} className={cn(align(c), c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasFooter && (
            <tfoot>
              <tr
                className="border-t-2 font-semibold [&>td]:px-3 [&>td]:py-2.5 [&>td]:tabular-nums print:[&>td]:px-1.5"
                data-testid={testId ? `${testId}-totals` : undefined}
              >
                {columns.map((c, i) => (
                  <td key={i} className={cn(align(c), c.className)}>
                    {i === 0 && c.footer === undefined ? footerLabel : c.footer}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
