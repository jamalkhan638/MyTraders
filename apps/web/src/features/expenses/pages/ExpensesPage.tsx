import { type Expense } from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import { Ban, Pencil, Plus, Receipt, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCurrentUser } from '@/features/auth/auth-context';
import { useExpenseCategories } from '@/features/expense-categories/hooks/useExpenseCategories';
import { formatBusinessDate, shiftDate, todayIn } from '@/lib/format/date';
import { formatAmount } from '@/lib/format/number';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { ExpenseFormDialog, type ExpenseDialogMode } from '../components/ExpenseFormDialog';
import { VoidExpenseDialog } from '../components/VoidExpenseDialog';
import { useExpenses } from '../hooks/useExpenses';

const PAGE_SIZE = 20;
type Status = 'active' | 'voided';

/** First and last day of the month of a business date. */
function monthRange(date: string): { from: string; to: string } {
  const from = `${date.slice(0, 7)}-01`;
  const next = shiftDate(`${date.slice(0, 7)}-28`, 4); // always lands in the next month
  return { from, to: shiftDate(`${next.slice(0, 7)}-01`, -1) };
}

/** Expenses (Admin) — docs §4.10. The total is the server's Σ for the filters, not the page. */
export function ExpensesPage() {
  const user = useCurrentUser();
  const currency = user.organization?.currency ?? '';
  const today = todayIn(user.organization?.timezone);
  const thisMonth = monthRange(today);
  const lastMonth = monthRange(shiftDate(thisMonth.from, -1));
  const [from, setFrom] = useState(thisMonth.from);
  const [to, setTo] = useState(thisMonth.to);
  const [categoryId, setCategoryId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ExpenseDialogMode | null>(null);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const q = useDebouncedValue(search.trim());
  const categories = useExpenseCategories({ pageSize: 100 });
  const expenses = useExpenses({
    page,
    pageSize: PAGE_SIZE,
    from: from || undefined,
    to: to || undefined,
    categoryId: categoryId || undefined,
    q: q || undefined,
    status,
  });
  const setRange = (range: { from: string; to: string }) => {
    setFrom(range.from);
    setTo(range.to);
    setPage(1);
  };
  const voided = status === 'voided';

  const columns = useMemo<ColumnDef<Expense, unknown>[]>(
    () => [
      {
        header: 'Date',
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatBusinessDate(row.original.expenseDate)}</span>
        ),
      },
      {
        header: 'Category',
        cell: ({ row }) => <Badge variant="outline">{row.original.category.name}</Badge>,
      },
      {
        header: 'Description',
        cell: ({ row }) => (
          <div className="min-w-48">
            {row.original.description ?? <span className="text-muted-foreground">—</span>}
            {row.original.reference && (
              <span className="block text-xs text-muted-foreground">
                Ref: {row.original.reference}
              </span>
            )}
            {row.original.voidReason && (
              <span className="block text-xs text-destructive">
                Voided: {row.original.voidReason}
              </span>
            )}
          </div>
        ),
      },
      {
        header: () => <span className="block text-right">Amount ({currency})</span>,
        id: 'amount',
        cell: ({ row }) => (
          <span className="block text-right font-medium tabular-nums">
            {formatAmount(row.original.amount)}
          </span>
        ),
      },
      {
        header: 'Created by',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.createdBy.name}</span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) =>
          row.original.status === 'ACTIVE' ? (
            <ExpenseActions
              expense={row.original}
              onEdit={() => setDialog({ kind: 'edit', expense: row.original })}
              onVoid={() => setVoiding(row.original)}
            />
          ) : null,
      },
    ],
    [currency],
  );

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Business expenses (fuel, salaries, rent…). They are deducted from Gross Profit to give Net Profit."
        actions={
          <Button onClick={() => setDialog({ kind: 'create' })}>
            <Plus />
            Add expense
          </Button>
        }
      />

      <div className="mb-4 grid gap-2 lg:grid-cols-[auto_auto_1fr]">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="From"
            className="w-40"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To"
            className="w-40"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => setRange(thisMonth)}>
            This month
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRange(lastMonth)}>
            Last month
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect
            aria-label="Category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.isActive ? ' (inactive)' : ''}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              setPage(1);
            }}
          >
            <option value="active">Active</option>
            <option value="voided">Voided</option>
          </NativeSelect>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search description or reference"
            aria-label="Search expenses"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Card className="mb-4 py-4">
        <CardContent className="flex flex-wrap items-baseline justify-between gap-2 px-5">
          <div>
            <div className="text-sm text-muted-foreground">
              {voided ? 'Total voided (not counted)' : 'Total expenses'} ·{' '}
              {from ? formatBusinessDate(from) : 'start'} – {to ? formatBusinessDate(to) : 'today'}
            </div>
            <div className="text-2xl font-semibold tabular-nums" data-testid="expenses-total">
              {currency} {formatAmount(expenses.data?.totalAmount ?? null)}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {expenses.data
              ? `${expenses.data.total} expense${expenses.data.total === 1 ? '' : 's'}`
              : ''}
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={expenses.data?.items}
        isLoading={expenses.isPending}
        error={expenses.isError ? 'Could not load expenses. Please try again.' : null}
        emptyMessage={
          <span className="flex flex-col items-center gap-2">
            <Receipt className="size-6" />
            No expenses for these filters.
          </span>
        }
        getRowId={(e) => e.id}
        pagination={
          expenses.data
            ? { page, pageSize: PAGE_SIZE, total: expenses.data.total, onPageChange: setPage }
            : undefined
        }
        renderMobileCard={(e) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{e.category.name}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatBusinessDate(e.expenseDate)}
                </span>
              </div>
              <div className="text-sm">{e.description ?? '—'}</div>
              {e.reference && (
                <div className="text-xs text-muted-foreground">Ref: {e.reference}</div>
              )}
              <div className="text-xs text-muted-foreground">by {e.createdBy.name}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="font-semibold tabular-nums">{formatAmount(e.amount)}</span>
              {e.status === 'ACTIVE' && (
                <ExpenseActions
                  expense={e}
                  onEdit={() => setDialog({ kind: 'edit', expense: e })}
                  onVoid={() => setVoiding(e)}
                />
              )}
            </div>
          </div>
        )}
      />

      <ExpenseFormDialog mode={dialog} onClose={() => setDialog(null)} />
      <VoidExpenseDialog expense={voiding} onClose={() => setVoiding(null)} />
    </>
  );
}

function ExpenseActions({
  expense,
  onEdit,
  onVoid,
}: {
  expense: Expense;
  onEdit: () => void;
  onVoid: () => void;
}) {
  const label = `${expense.category.name} ${formatAmount(expense.amount)} on ${formatBusinessDate(expense.expenseDate)}`;
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
        title="Edit"
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onVoid}
        aria-label={`Void ${label}`}
        title="Void"
        className="text-destructive hover:text-destructive"
      >
        <Ban />
      </Button>
    </div>
  );
}
