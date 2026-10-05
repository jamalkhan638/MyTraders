import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type CreateExpense,
  type Expense,
  type ExpenseList,
  type ExpenseSummary,
  type ExpenseSummaryQuery,
  type ListExpensesQuery,
  type UpdateExpense,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const REF = { select: { id: true, name: true } } as const;

const EXPENSE_FIELDS = {
  id: true,
  amount: true,
  expenseDate: true,
  description: true,
  reference: true,
  status: true,
  category: { select: { id: true, name: true, isActive: true } },
  createdBy: REF,
  updatedBy: REF,
  voidedAt: true,
  voidedBy: REF,
  voidReason: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ExpenseSelect;

type ExpenseRow = Prisma.ExpenseGetPayload<{ select: typeof EXPENSE_FIELDS }>;

const asDate = (value: string) => new Date(`${value}T00:00:00Z`);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

function fail(path: string, message: string): never {
  throw new UnprocessableEntityException({ message, details: [{ path, message }] });
}

/**
 * Expenses of the caller's organization (D-32) — Admin only. Amounts are numeric in the database
 * and decimal strings in the API; every total is a database SUM. Expenses are edited while ACTIVE
 * and voided (never deleted); only ACTIVE expenses count in any total.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: ListExpensesQuery): Promise<ExpenseList> {
    assertRange(query.from, query.to);
    const where: Prisma.ExpenseWhereInput = {
      status: query.status === 'voided' ? 'VOIDED' : 'ACTIVE',
      ...dateRange(query.from, query.to),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? {
            OR: [
              { description: { contains: query.q, mode: 'insensitive' } },
              { reference: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total, sum] = await Promise.all([
      this.db.client.expense.findMany({
        where,
        select: EXPENSE_FIELDS,
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.expense.count({ where }),
      this.db.client.expense.aggregate({ where, _sum: { amount: true } }),
    ]);
    return {
      items: rows.map(toExpense),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalAmount: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    };
  }

  async get(id: string): Promise<Expense> {
    const row = await this.db.client.expense.findFirst({ where: { id }, select: EXPENSE_FIELDS });
    if (!row) throw new NotFoundException('Expense not found');
    return toExpense(row);
  }

  async create(input: CreateExpense): Promise<Expense> {
    const auth = this.tenant.require();
    await this.assertCategoryUsable(input.categoryId);
    await this.assertNotFuture(input.expenseDate);
    const row = await this.db.client.expense.create({
      data: {
        organizationId: this.tenant.requireOrganizationId(),
        categoryId: input.categoryId,
        amount: input.amount,
        expenseDate: asDate(input.expenseDate),
        description: input.description ?? null,
        reference: input.reference ?? null,
        createdById: auth.userId,
      },
      select: { id: true },
    });
    return this.get(row.id);
  }

  async update(id: string, input: UpdateExpense): Promise<Expense> {
    const auth = this.tenant.require();
    const current = await this.db.client.expense.findFirst({
      where: { id },
      select: { status: true, categoryId: true },
    });
    if (!current) throw new NotFoundException('Expense not found');
    if (current.status === 'VOIDED')
      throw new ConflictException('A voided expense cannot be edited');
    // A changed category must be active; keeping a since-deactivated one is fine.
    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      await this.assertCategoryUsable(input.categoryId);
    }
    if (input.expenseDate !== undefined) await this.assertNotFuture(input.expenseDate);

    const data: Prisma.ExpenseUncheckedUpdateManyInput = { updatedById: auth.userId };
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.expenseDate !== undefined) data.expenseDate = asDate(input.expenseDate);
    if (input.description !== undefined) data.description = input.description;
    if (input.reference !== undefined) data.reference = input.reference;
    const { count } = await this.db.client.expense.updateMany({
      where: { id, status: 'ACTIVE' },
      data,
    });
    if (count === 0) throw new ConflictException('A voided expense cannot be edited');
    return this.get(id);
  }

  /** Voids an expense (kept for history, excluded from every total). */
  async void(id: string, reason: string): Promise<Expense> {
    const auth = this.tenant.require();
    const { count } = await this.db.client.expense.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'VOIDED', voidedAt: new Date(), voidedById: auth.userId, voidReason: reason },
    });
    if (count === 0) {
      await this.get(id); // 404 when it does not exist in this organization
      throw new ConflictException('This expense is already voided');
    }
    return this.get(id);
  }

  /**
   * Σ ACTIVE expenses dated in [from, to], by category. Defaults to the current month in the
   * organization timezone — "This Month Expenses" for the Dashboard, and the Expenses term of
   * Net Profit = Gross Profit − Expenses for reports.
   */
  async summary(query: ExpenseSummaryQuery): Promise<ExpenseSummary> {
    const month = monthOf(await this.today());
    const from = query.from ?? month.from;
    const to = query.to ?? month.to;
    assertRange(from, to);
    const where: Prisma.ExpenseWhereInput = { status: 'ACTIVE', ...dateRange(from, to) };
    const [groups, categories] = await Promise.all([
      this.db.client.expense.groupBy({
        by: ['categoryId'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.db.client.expenseCategory.findMany({ select: { id: true, name: true } }),
    ]);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const total = groups.reduce((acc, g) => acc.plus(g._sum.amount ?? 0), new Prisma.Decimal(0));
    return {
      from,
      to,
      total: total.toFixed(2),
      count: groups.reduce((acc, g) => acc + g._count._all, 0),
      byCategory: groups
        .map((g) => ({
          category: { id: g.categoryId, name: names.get(g.categoryId) ?? '' },
          total: (g._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
          count: g._count._all,
        }))
        .sort((a, b) => a.category.name.localeCompare(b.category.name)),
    };
  }

  /** This Month Expenses (organization timezone) — for the future Dashboard card. */
  async thisMonthTotal(): Promise<string> {
    return (await this.summary({})).total;
  }

  private async assertCategoryUsable(categoryId: string): Promise<void> {
    const category = await this.db.client.expenseCategory.findFirst({
      where: { id: categoryId },
      select: { isActive: true },
    });
    // Another organization's category is invisible here, exactly like an unknown one.
    if (!category) fail('categoryId', 'Expense category not found');
    if (!category.isActive) fail('categoryId', 'This expense category is inactive');
  }

  private async today(): Promise<string> {
    const org = await this.db.client.organization.findFirstOrThrow({ select: { timezone: true } });
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: org.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private async assertNotFuture(date: string): Promise<void> {
    if (date > (await this.today())) fail('expenseDate', 'The date cannot be in the future');
  }
}

function assertRange(from?: string, to?: string): void {
  if (from && to && from > to) {
    const message = '"To" must be on or after "From"';
    throw new BadRequestException({ message, details: [{ path: 'to', message }] });
  }
}

function dateRange(from?: string, to?: string): Prisma.ExpenseWhereInput {
  if (!from && !to) return {};
  return {
    expenseDate: { ...(from ? { gte: asDate(from) } : {}), ...(to ? { lte: asDate(to) } : {}) },
  };
}

/** First and last day of the month of a business date. */
function monthOf(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

function toExpense(row: ExpenseRow): Expense {
  return {
    ...row,
    amount: row.amount.toFixed(2),
    expenseDate: isoDate(row.expenseDate),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
