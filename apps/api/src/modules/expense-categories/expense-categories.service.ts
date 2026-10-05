import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ExpenseCategory,
  type CreateExpenseCategoryInput,
  type ListExpenseCategoriesQuery,
  normalizeName,
  type Paginated,
  type UpdateExpenseCategoryInput,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const EXPENSE_CATEGORY_FIELDS = {
  id: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ExpenseCategorySelect;

type ExpenseCategoryRow = Prisma.ExpenseCategoryGetPayload<{
  select: typeof EXPENSE_CATEGORY_FIELDS;
}>;

const DUPLICATE_NAME = 'An expense category with this name already exists';

/** Expense categories of the caller's organization (docs/product-requirements.md §4.10). */
@Injectable()
export class ExpenseCategoriesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: ListExpenseCategoriesQuery): Promise<Paginated<ExpenseCategory>> {
    const where: Prisma.ExpenseCategoryWhereInput = {
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.q ? { nameNormalized: { contains: normalizeName(query.q) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.client.expenseCategory.findMany({
        where,
        select: EXPENSE_CATEGORY_FIELDS,
        orderBy: { nameNormalized: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.expenseCategory.count({ where }),
    ]);
    return {
      items: rows.map(toExpenseCategory),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<ExpenseCategory> {
    const row = await this.db.client.expenseCategory.findFirst({
      where: { id },
      select: EXPENSE_CATEGORY_FIELDS,
    });
    if (!row) throw new NotFoundException('Expense category not found');
    return toExpenseCategory(row);
  }

  async create(input: CreateExpenseCategoryInput): Promise<ExpenseCategory> {
    const row = await this.withUniqueName(() =>
      this.db.client.expenseCategory.create({
        data: {
          // Same value the tenant client would inject; stated explicitly for the Prisma types.
          organizationId: this.tenant.requireOrganizationId(),
          name: input.name,
          nameNormalized: normalizeName(input.name),
        },
        select: EXPENSE_CATEGORY_FIELDS,
      }),
    );
    return toExpenseCategory(row);
  }

  async update(id: string, input: UpdateExpenseCategoryInput): Promise<ExpenseCategory> {
    const data: Prisma.ExpenseCategoryUpdateManyMutationInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
      data.nameNormalized = normalizeName(input.name);
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const { count } = await this.withUniqueName(() =>
      this.db.client.expenseCategory.updateMany({ where: { id }, data }),
    );
    if (count === 0) throw new NotFoundException('Expense category not found');
    return this.get(id);
  }

  private async withUniqueName<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(DUPLICATE_NAME);
      }
      throw error;
    }
  }
}

function toExpenseCategory(row: ExpenseCategoryRow): ExpenseCategory {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
