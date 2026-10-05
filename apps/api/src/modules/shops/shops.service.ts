import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  type ApiErrorBody,
  type CreateShop,
  type ListShopsQuery,
  type Paginated,
  type Shop,
  UNASSIGNED,
  type UpdateShop,
} from '@mytraders/shared-types';
import { type Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { ShopLedgerService } from '../ledger/shop-ledger.service';

const REF = { select: { id: true, name: true, isActive: true } } as const;

const SHOP_FIELDS = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  address: true,
  ntn: true,
  strn: true,
  cnic: true,
  area: REF,
  category: REF,
  assignedOrderBooker: REF,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ShopSelect;

type ShopRow = Prisma.ShopGetPayload<{ select: typeof SHOP_FIELDS }>;

/** Shop list filters, shared by the Shops page and the shop reports. */
export function shopWhere(
  query: Pick<ListShopsQuery, 'q' | 'areaId' | 'categoryId' | 'orderBookerId' | 'status'>,
): Prisma.ShopWhereInput {
  return {
    ...(query.status ? { isActive: query.status === 'active' } : {}),
    ...(query.areaId ? { areaId: query.areaId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.orderBookerId
      ? { assignedOrderBookerId: query.orderBookerId === UNASSIGNED ? null : query.orderBookerId }
      : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { contactPerson: { contains: query.q, mode: 'insensitive' } },
            { phone: { contains: query.q } },
          ],
        }
      : {}),
  };
}

type References = Pick<CreateShop, 'areaId' | 'categoryId' | 'assignedOrderBookerId'>;
type FieldError = NonNullable<ApiErrorBody['details']>[number];

/**
 * Shops of the caller's organization (docs/product-requirements.md §4.4, D-23).
 * Area, category and order booker ids are always resolved through the tenant client, so an id
 * belonging to another organization behaves exactly like an id that does not exist.
 */
@Injectable()
export class ShopsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly ledger: ShopLedgerService,
  ) {}

  async list(query: ListShopsQuery): Promise<Paginated<Shop>> {
    const where = shopWhere(query);
    const [rows, total] = await Promise.all([
      this.db.client.shop.findMany({
        where,
        select: SHOP_FIELDS,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.shop.count({ where }),
    ]);
    // One grouped ledger query for the whole page (no N+1).
    const balances = await this.ledger.balances(rows.map((r) => r.id));
    return {
      items: rows.map((row) => toShop(row, balances.get(row.id) ?? '0.00')),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<Shop> {
    const row = await this.db.client.shop.findFirst({ where: { id }, select: SHOP_FIELDS });
    if (!row) throw new NotFoundException('Shop not found');
    return toShop(row, (await this.ledger.balance(row.id)).outstandingBalance);
  }

  async create(input: CreateShop): Promise<Shop> {
    await this.assertReferences(input);
    const row = await this.db.client.shop.create({
      data: {
        // Same value the tenant client would inject; stated explicitly for the Prisma types.
        organizationId: this.tenant.requireOrganizationId(),
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        ntn: input.ntn ?? null,
        strn: input.strn ?? null,
        cnic: input.cnic ?? null,
        areaId: input.areaId,
        categoryId: input.categoryId ?? null,
        assignedOrderBookerId: input.assignedOrderBookerId ?? null,
      },
      select: SHOP_FIELDS,
    });
    return toShop(row, (await this.ledger.balance(row.id)).outstandingBalance);
  }

  async update(id: string, input: UpdateShop): Promise<Shop> {
    const current = await this.db.client.shop.findFirst({
      where: { id },
      select: { areaId: true, categoryId: true, assignedOrderBookerId: true },
    });
    if (!current) throw new NotFoundException('Shop not found');

    // Only values that change are validated, so a shop whose area was deactivated later
    // can still be edited without being forced to move.
    await this.assertReferences({
      areaId: changed(input.areaId, current.areaId),
      categoryId: changed(input.categoryId, current.categoryId),
      assignedOrderBookerId: changed(input.assignedOrderBookerId, current.assignedOrderBookerId),
    });

    const { count } = await this.db.client.shop.updateMany({ where: { id }, data: input });
    if (count === 0) throw new NotFoundException('Shop not found');
    return this.get(id);
  }

  /** Each id must be an active record of the current organization (D-23). */
  private async assertReferences(refs: Partial<References>): Promise<void> {
    const details: FieldError[] = [];

    if (refs.areaId) {
      const area = await this.db.client.area.findFirst({
        where: { id: refs.areaId },
        select: { isActive: true },
      });
      if (!area) details.push({ path: 'areaId', message: 'Area not found' });
      else if (!area.isActive) details.push({ path: 'areaId', message: 'This area is inactive' });
    }

    if (refs.categoryId) {
      const category = await this.db.client.shopCategory.findFirst({
        where: { id: refs.categoryId },
        select: { isActive: true },
      });
      if (!category) details.push({ path: 'categoryId', message: 'Shop category not found' });
      else if (!category.isActive)
        details.push({ path: 'categoryId', message: 'This shop category is inactive' });
    }

    if (refs.assignedOrderBookerId) {
      const booker = await this.db.client.user.findFirst({
        where: { id: refs.assignedOrderBookerId },
        select: { role: true, isActive: true },
      });
      if (!booker || booker.role !== 'ORDER_BOOKER') {
        details.push({ path: 'assignedOrderBookerId', message: 'Order booker not found' });
      } else if (!booker.isActive) {
        details.push({ path: 'assignedOrderBookerId', message: 'This order booker is inactive' });
      }
    }

    if (details.length > 0) {
      throw new UnprocessableEntityException({
        message: details.map((d) => d.message).join('. '),
        details,
      });
    }
  }
}

/** The new value when it differs from the current one, otherwise undefined (= nothing to check). */
function changed<T>(next: T | undefined, current: T): T | undefined {
  return next === undefined || next === current ? undefined : next;
}

function toShop(row: ShopRow, outstandingBalance: string): Shop {
  return {
    ...row,
    outstandingBalance,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
