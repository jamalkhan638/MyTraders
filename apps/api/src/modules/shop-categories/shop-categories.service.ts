import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ShopCategory,
  type CreateShopCategoryInput,
  type ListShopCategoriesQuery,
  normalizeName,
  type Paginated,
  type UpdateShopCategoryInput,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const SHOP_CATEGORY_FIELDS = {
  id: true,
  name: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ShopCategorySelect;

type ShopCategoryRow = Prisma.ShopCategoryGetPayload<{ select: typeof SHOP_CATEGORY_FIELDS }>;

const DUPLICATE_NAME = 'A shop category with this name already exists';

/** Shop categories (shop types) of the caller's organization (docs/product-requirements.md §4.3a). */
@Injectable()
export class ShopCategoriesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: ListShopCategoriesQuery): Promise<Paginated<ShopCategory>> {
    const where: Prisma.ShopCategoryWhereInput = {
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.q ? { nameNormalized: { contains: normalizeName(query.q) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.client.shopCategory.findMany({
        where,
        select: SHOP_CATEGORY_FIELDS,
        orderBy: { nameNormalized: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.shopCategory.count({ where }),
    ]);
    return { items: rows.map(toShopCategory), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<ShopCategory> {
    const row = await this.db.client.shopCategory.findFirst({
      where: { id },
      select: SHOP_CATEGORY_FIELDS,
    });
    if (!row) throw new NotFoundException('Shop category not found');
    return toShopCategory(row);
  }

  async create(input: CreateShopCategoryInput): Promise<ShopCategory> {
    const row = await this.withUniqueName(() =>
      this.db.client.shopCategory.create({
        data: {
          // Same value the tenant client would inject; stated explicitly for the Prisma types.
          organizationId: this.tenant.requireOrganizationId(),
          name: input.name,
          nameNormalized: normalizeName(input.name),
        },
        select: SHOP_CATEGORY_FIELDS,
      }),
    );
    return toShopCategory(row);
  }

  async update(id: string, input: UpdateShopCategoryInput): Promise<ShopCategory> {
    const data: Prisma.ShopCategoryUpdateManyMutationInput = {};
    if (input.name !== undefined) {
      data.name = input.name;
      data.nameNormalized = normalizeName(input.name);
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const { count } = await this.withUniqueName(() =>
      this.db.client.shopCategory.updateMany({ where: { id }, data }),
    );
    if (count === 0) throw new NotFoundException('Shop category not found');
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

function toShopCategory(row: ShopCategoryRow): ShopCategory {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
