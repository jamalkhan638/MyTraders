import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Footer of a newest-first history list: always shows "1–20 of 57", and Newer / Older buttons
 * once there is more than one page.
 */
export function HistoryPager({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages = Math.ceil(total / pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
      <span className="text-muted-foreground tabular-nums" data-testid="history-range">
        {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of{' '}
        {total.toLocaleString('en-US')}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
            Newer
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            Older
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
