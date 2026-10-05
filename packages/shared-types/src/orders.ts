import { z } from 'zod';
import { optionalText, paginatedSchema, paginationQuerySchema } from './common';
import { ProductType, ProductUnit, QuantityUnit, WeightBasis } from './enums';

export const OrderStatus = {
  PENDING: 'PENDING',
  INVOICED: 'INVOICED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  INVOICED: 'Invoiced',
  CANCELLED: 'Cancelled',
};

export const ORDER_MAX_LINES = 200;
export const ORDER_MAX_QUANTITY = 100_000;

const refSchema = z.object({ id: z.uuid(), name: z.string() });

/** Order row in lists (Admin and booker). No prices — orders are products and quantities only. */
export const orderSummarySchema = z.object({
  id: z.uuid(),
  orderNumber: z.string(),
  status: z.enum(OrderStatus),
  shop: refSchema,
  area: refSchema,
  orderBooker: refSchema,
  itemCount: z.number().int(),
  /** Sum of the quantities counted in pieces (TIN lines). Units are never mixed (D-28). */
  totalPieces: z.number().int(),
  /** Sum of the quantities counted in cartons (POUCH lines). */
  totalCartons: z.number().int(),
  createdAt: z.string(),
});
export type OrderSummary = z.infer<typeof orderSummarySchema>;

export const orderItemSchema = z.object({
  id: z.uuid(),
  product: z.object({
    id: z.uuid(),
    name: z.string(),
    code: z.string().nullable(),
    type: z.enum(ProductType),
    weight: z.string().nullable(),
    weightUnit: z.enum(ProductUnit).nullable(),
    weightBasis: z.enum(WeightBasis).nullable(),
    piecesPerCarton: z.number().int().nullable(),
    isActive: z.boolean(),
  }),
  /** Whole number in `quantityUnit`. */
  quantity: z.number().int(),
  /** PIECE for a TIN, CARTON for a POUCH — fixed when the order was booked (D-28). */
  quantityUnit: z.enum(QuantityUnit),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderDetailsSchema = orderSummarySchema.extend({
  notes: z.string().nullable(),
  items: z.array(orderItemSchema),
  cancelledAt: z.string().nullable(),
  cancelledBy: refSchema.nullable(),
  /** the invoice generated from this order, once INVOICED */
  invoice: z.object({ id: z.uuid(), invoiceNumber: z.string() }).nullable(),
  updatedAt: z.string(),
});
export type OrderDetails = z.infer<typeof orderDetailsSchema>;

export const orderListSchema = paginatedSchema(orderSummarySchema);

/**
 * GET /orders query. `q` matches order number or shop name. For an Order Booker the list is
 * always limited to their own orders, whatever `orderBookerId` says.
 */
export const listOrdersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  areaId: z.uuid().optional(),
  orderBookerId: z.uuid().optional(),
  status: z.enum(OrderStatus).optional(),
});
export type ListOrdersQuery = z.output<typeof listOrdersQuerySchema>;
export type ListOrdersQueryInput = z.input<typeof listOrdersQuerySchema>;

const quantity = z
  .number({ message: 'Quantity must be a whole number' })
  .int('Quantity must be a whole number')
  .positive('Quantity must be at least 1')
  .max(
    ORDER_MAX_QUANTITY,
    `Quantity must be at most ${ORDER_MAX_QUANTITY.toLocaleString('en-US')}`,
  );

/**
 * POST /orders (Order Booker). Only shop, products, quantities and an optional note are accepted;
 * the order number, organization, booker, prices, status and each line's quantity unit (from the
 * product type: TIN → pieces, POUCH → cartons) are decided by the server.
 */
export const createOrderSchema = z
  .object({
    shopId: z.uuid({ message: 'Choose a shop' }),
    items: z
      .array(z.object({ productId: z.uuid({ message: 'Choose a product' }), quantity }), {
        message: 'Add at least one product',
      })
      .min(1, 'Add at least one product')
      .max(ORDER_MAX_LINES, `An order can have at most ${ORDER_MAX_LINES} products`),
    notes: optionalText(500),
  })
  .superRefine((order, ctx) => {
    const seen = new Set<string>();
    order.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'productId'],
          message: 'This product is already in the order — change its quantity instead',
        });
      }
      seen.add(item.productId);
    });
  });
export type CreateOrderInput = z.input<typeof createOrderSchema>;
export type CreateOrder = z.output<typeof createOrderSchema>;
