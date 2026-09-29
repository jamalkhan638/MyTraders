import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Desktop table (≥ md) that collapses into cards on phones (docs/frontend-guidelines.md §3, §6).
 * Server-side pagination: pass the current page of rows plus `pagination`.
 */
export function DataTable<T>({
  columns,
  data,
  isLoading,
  error,
  emptyMessage = 'Nothing here yet.',
  renderMobileCard,
  getRowId,
  pagination,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[] | undefined;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: ReactNode;
  renderMobileCard: (row: T) => ReactNode;
  getRowId: (row: T) => string;
  pagination?: Pagination;
}) {
  // The project does not use the React Compiler; TanStack Table is fine with plain React.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data ?? [],
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  });

  let body: ReactNode = null;
  if (isLoading) {
    body = (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  } else if (error) {
    body = <p className="p-8 text-center text-sm text-destructive">{error}</p>;
  } else if (!data || data.length === 0) {
    body = <p className="p-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      {body ?? (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id} className="hover:bg-transparent">
                    {group.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="divide-y md:hidden">
            {(data ?? []).map((row) => (
              <li key={getRowId(row)} className="p-4">
                {renderMobileCard(row)}
              </li>
            ))}
          </ul>
        </>
      )}
      {pagination && pagination.total > 0 && <PaginationBar {...pagination} />}
    </Card>
  );
}

function PaginationBar({ page, pageSize, total, onPageChange }: Pagination) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <span className="px-2">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
