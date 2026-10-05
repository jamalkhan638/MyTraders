import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type ApiErrorBody,
  type CreateOrder,
  type ListOrdersQuery,
  type OrderDetails,
  type OrderSummary,
  type Paginated,
} from '@mytraders/shared-types';
import { type Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { type AuthContext } from '../../common/types/auth-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { type TenantPrismaClient } from '../../prisma/tenant-scope';
import { allocateOrderNumber } from './order-number';

type TenantTx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];
type FieldError = NonNullable<ApiErrorBody['details']>[number];

const REF = { select: { id: true, name: true } } as const;

const SUMMARY_FIELDS = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  shop: { select: { id: true, name: true, area: REF } },
  orderBooker: REF,
  items: { select: { quantity: true } },
} as const satisfies Prisma.OrderSelect;

const DETAIL_FIELDS = {
  ...SUMMARY_FIELDS,
  notes: true,
  cancelledAt: true,
  cancelledBy: REF,
  updatedAt: true,
  items: {
    select: {
      id: true,
      quantity: true,
      product: {
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          weight: true,
          weightUnit: true,
          weightBasis: true,
          piecesPerCarton: true,
          isActive: true,
        },
      },
    },
    orderBy: { product: { name: 'asc' } },
  },
} as const satisfies Prisma.OrderSelect;

type SummaryRow = Prisma.OrderGetPayload<{ select: typeof SUMMARY_FIELDS }>;
type DetailRow = Prisma.OrderGetPayload<{ select: typeof DETAIL_FIELDS }>;

/**
 * Orders (docs §4.8, D-25). Who can see an order is decided here from the authenticated user:
 * Admins see every order of their organization, Order Bookers only the orders they created.
 * Nothing in the request can widen that scope.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: ListOrdersQuery): Promise<Paginated<OrderSummary>> {
    const auth = this.tenant.require();
    const where: Prisma.OrderWhereInput = {
      ...visibleTo(auth),
      ...(query.status ? { status: query.status } : {}),
      // A booker's own scope above always wins; this filter only narrows the Admin's view.
      ...(query.orderBookerId && auth.role !== 'ORDER_BOOKER'
        ? { orderBookerId: query.orderBookerId }
        : {}),
      ...(query.areaId ? { shop: { areaId: query.areaId } } : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q, mode: 'insensitive' } },
              { shop: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.client.order.findMany({
        where,
        select: SUMMARY_FIELDS,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.order.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<OrderDetails> {
    const row = await this.db.client.order.findFirst({
      where: { id, ...visibleTo(this.tenant.require()) },
      select: DETAIL_FIELDS,
    });
    if (!row) throw new NotFoundException('Order not found');
    return toDetails(row);
  }

  /** Order Booker only. The booker, organization, number and status are never taken from input. */
  async create(input: CreateOrder): Promise<OrderDetails> {
    const auth = this.tenant.require();
    if (auth.role !== 'ORDER_BOOKER')
      throw new ForbiddenException('Only order bookers book orders');
    const organizationId = this.tenant.requireOrganizationId();

    // Shop/product checks, number allocation and the order with all its lines: one transaction.
    const id = await this.db.client.$transaction(async (tx) => {
      await assertOrderable(tx, auth.userId, input);
      const orderNumber = await allocateOrderNumber(tx, organizationId);
      const order = await tx.order.create({
        data: {
          organizationId,
          orderNumber,
          shopId: input.shopId,
          orderBookerId: auth.userId,
          notes: input.notes ?? null,
          items: {
            create: input.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
        },
        select: { id: true },
      });
      return order.id;
    });
    return this.get(id);
  }

  /** Admin: any pending order of the organization. Booker: only their own pending order. */
  async cancel(id: string): Promise<OrderDetails> {
    const auth = this.tenant.require();
    const visible = { id, ...visibleTo(auth) };
    const { count } = await this.db.client.order.updateMany({
      where: { ...visible, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: auth.userId },
    });
    if (count === 0) {
      const existing = await this.db.client.order.findFirst({
        where: visible,
        select: { status: true },
      });
      if (!existing) throw new NotFoundException('Order not found');
      throw new ConflictException(
        `Only pending orders can be cancelled (this order is ${existing.status.toLowerCase()})`,
      );
    }
    return this.get(id);
  }
}

/** Orders the user may see: the whole organization for Admins, own orders for bookers. */
function visibleTo(auth: AuthContext): Prisma.OrderWhereInput {
  return auth.role === 'ORDER_BOOKER' ? { orderBookerId: auth.userId } : {};
}

/**
 * The shop must be an active shop assigned to this booker, and every product an active product
 * of the organization (the tenant client already hides other organizations' records, so a
 * foreign id fails exactly like an unknown one).
 */
async function assertOrderable(tx: TenantTx, bookerId: string, input: CreateOrder): Promise<void> {
  const details: FieldError[] = [];

  const shop = await tx.shop.findFirst({
    where: { id: input.shopId, assignedOrderBookerId: bookerId },
    select: { isActive: true },
  });
  if (!shop) details.push({ path: 'shopId', message: 'Shop not found or not assigned to you' });
  else if (!shop.isActive) details.push({ path: 'shopId', message: 'This shop is inactive' });

  const productIds = input.items.map((item) => item.productId);
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, isActive: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  input.items.forEach((item, index) => {
    const product = byId.get(item.productId);
    const path = `items.${index}.productId`;
    if (!product) details.push({ path, message: 'Product not found' });
    else if (!product.isActive)
      details.push({ path, message: 'This product is no longer available' });
  });

  if (details.length > 0) {
    throw new UnprocessableEntityException({
      message: details.map((d) => d.message).join('. '),
      details,
    });
  }
}

function toSummary(row: SummaryRow): OrderSummary {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    shop: { id: row.shop.id, name: row.shop.name },
    area: row.shop.area,
    orderBooker: row.orderBooker,
    itemCount: row.items.length,
    totalQuantity: row.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetails(row: DetailRow): OrderDetails {
  return {
    ...toSummary(row),
    notes: row.notes,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledBy: row.cancelledBy,
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      product: { ...item.product, weight: item.product.weight?.toString() ?? null },
    })),
  };
}
