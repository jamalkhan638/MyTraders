import {
  type ExpenseCategory,
  type ListExpenseCategoriesQueryInput,
} from '@mytraders/shared-types';
import { type ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Power, Search, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useCurrentUser } from '@/features/auth/auth-context';
import { formatDate } from '@/lib/format/date';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import {
  ExpenseCategoryFormDialog,
  type ExpenseCategoryDialogMode,
} from '../components/ExpenseCategoryFormDialog';
import { ToggleExpenseCategoryDialog } from '../components/ToggleExpenseCategoryDialog';
import { useExpenseCategories } from '../hooks/useExpenseCategories';

const PAGE_SIZE = 20;
type StatusFilter = 'active' | 'inactive' | '';

export function ExpenseCategoriesPage() {
  const timeZone = useCurrentUser().organization?.timezone;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<ExpenseCategoryDialogMode | null>(null);
  const [toggling, setToggling] = useState<ExpenseCategory | null>(null);

  const q = useDebouncedValue(search.trim());
  const params: ListExpenseCategoriesQueryInput = {
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
  };
  const categories = useExpenseCategories(params);
  const filtered = Boolean(q || status);

  const columns = useMemo<ColumnDef<ExpenseCategory, unknown>[]>(
    () => [
      {
        header: 'Name',
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        header: 'Status',
        cell: ({ row }) => <ExpenseCategoryStatusBadge isActive={row.original.isActive} />,
      },
      {
        header: 'Created',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.original.createdAt, timeZone)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <ExpenseCategoryActions
            category={row.original}
            onEdit={() => setDialog({ kind: 'edit', category: row.original })}
            onToggle={() => setToggling(row.original)}
          />
        ),
      },
    ],
    [timeZone],
  );

  return (
    <section className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Expense Categories</h2>
          <p className="text-sm text-muted-foreground">
            What you spend money on, e.g. Fuel, Salary, Vehicle Maintenance, Rent or Electricity.
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <Plus />
          Add category
        </Button>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search expense categories"
            className="pl-9"
            value={search}
            aria-label="Search expense categories"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <NativeSelect
          value={status}
          aria-label="Status"
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </NativeSelect>
      </div>

      <DataTable
        columns={columns}
        data={categories.data?.items}
        isLoading={categories.isPending}
        error={categories.isError ? 'Could not load expense categories. Please try again.' : null}
        emptyMessage={
          filtered ? (
            'No expense categories match these filters.'
          ) : (
            <span className="flex flex-col items-center gap-2">
              <Tags className="size-6" />
              No expense categories yet. Add your first one.
            </span>
          )
        }
        getRowId={(c) => c.id}
        pagination={
          categories.data
            ? { page, pageSize: PAGE_SIZE, total: categories.data.total, onPageChange: setPage }
            : undefined
        }
        renderMobileCard={(a) => (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="font-medium">{a.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ExpenseCategoryStatusBadge isActive={a.isActive} />
                Created {formatDate(a.createdAt, timeZone)}
              </div>
            </div>
            <ExpenseCategoryActions
              category={a}
              onEdit={() => setDialog({ kind: 'edit', category: a })}
              onToggle={() => setToggling(a)}
            />
          </div>
        )}
      />

      <ExpenseCategoryFormDialog mode={dialog} onClose={() => setDialog(null)} />
      <ToggleExpenseCategoryDialog category={toggling} onClose={() => setToggling(null)} />
    </section>
  );
}

function ExpenseCategoryStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge>Active</Badge> : <Badge variant="destructive">Inactive</Badge>;
}

function ExpenseCategoryActions({
  category,
  onEdit,
  onToggle,
}: {
  category: ExpenseCategory;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onEdit}
        aria-label={`Edit ${category.name}`}
        title="Edit"
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label={`${category.isActive ? 'Deactivate' : 'Activate'} ${category.name}`}
        title={category.isActive ? 'Deactivate' : 'Activate'}
        className={
          category.isActive
            ? 'text-destructive hover:text-destructive'
            : 'text-primary hover:text-primary'
        }
      >
        <Power />
      </Button>
    </div>
  );
}
