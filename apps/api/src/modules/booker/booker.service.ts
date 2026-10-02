import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type BookerArea,
  type BookerProduct,
  type BookerShop,
  type ListBookerProductsQuery,
  type ListBookerShopsQuery,
  type Paginated,
} from '@mytraders/shared-types';
import { type Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

const SHOP_FIELDS = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  address: true,
  area: { select: { id: true, name: true } },
} as const satisfies Prisma.ShopSelect;

/** Identification only — no price, cost or tax field is ever selected (D-24). */
const PRODUCT_FIELDS = {
  id: true,
  name: true,
  code: true,
  weight: true,
  unit: true,
  piecesPerCarton: true,
} as const satisfies Prisma.ProductSelect;

/**
 * Read-only data for the Order Booker app. Shops are limited to the active shops assigned to the
 * signed-in booker; the booker id comes from the session, never from the request.
 */
@Injectable()
export class BookerService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private myShops(): Prisma.ShopWhereInput {
    return { assignedOrderBookerId: this.tenant.require().userId, isActive: true };
  }

  async listShops(query: ListBookerShopsQuery): Promise<Paginated<BookerShop>> {
    const where: Prisma.ShopWhereInput = {
      ...this.myShops(),
      ...(query.areaId ? { areaId: query.areaId } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.client.shop.findMany({
        where,
        select: SHOP_FIELDS,
        orderBy: [{ area: { name: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.shop.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getShop(id: string): Promise<BookerShop> {
    const shop = await this.db.client.shop.findFirst({
      where: { id, ...this.myShops() },
      select: SHOP_FIELDS,
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  /** Areas that contain at least one of the booker's active assigned shops. */
  async listAreas(): Promise<BookerArea[]> {
    const groups = await this.db.client.shop.groupBy({
      by: ['areaId'],
      where: this.myShops(),
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const areas = await this.db.client.area.findMany({
      where: { id: { in: groups.map((g) => g.areaId) } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const counts = new Map(groups.map((g) => [g.areaId, g._count._all]));
    return areas.map((area) => ({ ...area, shopCount: counts.get(area.id) ?? 0 }));
  }

  async listProducts(query: ListBookerProductsQuery): Promise<Paginated<BookerProduct>> {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
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
    return {
      items: rows.map((p) => ({ ...p, weight: p.weight?.toString() ?? null })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
