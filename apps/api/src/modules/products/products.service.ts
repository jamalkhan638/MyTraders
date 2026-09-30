import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateProduct,
  type ListProductsQuery,
  type Paginated,
  type Product,
  type UpdateProduct,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const PRODUCT_FIELDS = {
  id: true,
  name: true,
  code: true,
  rateCode: true,
  retailPrice: true,
  tradePrice: true,
  costPrice: true,
  weight: true,
  unit: true,
  piecesPerCarton: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_FIELDS }>;

const DUPLICATE_CODE = 'A product with this code already exists';

/**
 * Products of the caller's organization (docs/product-requirements.md §4.6). Prices are
 * passed to Prisma as decimal strings and stored as numeric — never JS floats.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: ListProductsQuery): Promise<Paginated<Product>> {
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { codeNormalized: { contains: query.q.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.client.product.findMany({
        where,
        select: PRODUCT_FIELDS,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.product.count({ where }),
    ]);
    return { items: rows.map(toProduct), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Product> {
    const row = await this.db.client.product.findFirst({ where: { id }, select: PRODUCT_FIELDS });
    if (!row) throw new NotFoundException('Product not found');
    return toProduct(row);
  }

  async create(input: CreateProduct): Promise<Product> {
    const row = await this.withUniqueCode(() =>
      this.db.client.product.create({
        data: {
          // Same value the tenant client would inject; stated explicitly for the Prisma types.
          organizationId: this.tenant.requireOrganizationId(),
          name: input.name,
          code: input.code ?? null,
          codeNormalized: normalizeCode(input.code),
          rateCode: input.rateCode ?? null,
          retailPrice: input.retailPrice,
          tradePrice: input.tradePrice,
          costPrice: input.costPrice,
          weight: input.weight ?? null,
          unit: input.unit ?? null,
          piecesPerCarton: input.piecesPerCarton ?? null,
        },
        select: PRODUCT_FIELDS,
      }),
    );
    return toProduct(row);
  }

  async update(id: string, input: UpdateProduct): Promise<Product> {
    const { code, ...rest } = input;
    const data: Prisma.ProductUpdateManyMutationInput = { ...rest };
    if (code !== undefined) {
      data.code = code;
      data.codeNormalized = normalizeCode(code);
    }
    const { count } = await this.withUniqueCode(() =>
      this.db.client.product.updateMany({ where: { id }, data }),
    );
    if (count === 0) throw new NotFoundException('Product not found');
    return this.get(id);
  }

  private async withUniqueCode<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(DUPLICATE_CODE);
      }
      throw error;
    }
  }
}

function normalizeCode(code: string | null | undefined): string | null {
  return code ? code.toLowerCase() : null;
}

function toProduct(row: ProductRow): Product {
  return {
    ...row,
    retailPrice: row.retailPrice.toFixed(2),
    tradePrice: row.tradePrice.toFixed(2),
    costPrice: row.costPrice.toFixed(2),
    weight: row.weight?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
