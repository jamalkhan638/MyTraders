import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type ApiErrorBody,
  type CalculatedInvoiceLine,
  calculateInvoiceLine,
  calculateInvoiceTotals,
  type CreateInvoice,
  initialQuantities,
  type InvoiceDetails,
  type InvoiceDraft,
  type InvoiceDraftQuery,
  type InvoicePreview,
  type InvoiceSummary,
  type ListInvoicesQuery,
  optionalInvoiceAmount,
  type Paginated,
} from '@mytraders/shared-types';
import { type Prisma } from '@prisma/client';
import { allocateDocumentNumber, peekDocumentNumber } from '../../common/numbering/document-number';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { type TenantPrismaClient } from '../../prisma/tenant-scope';
import { ShopLedgerService } from '../ledger/shop-ledger.service';
import { PRODUCT_FIELDS, type ProductRow, toProduct } from '../products/products.service';

type TenantTx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];
type Db = TenantPrismaClient | TenantTx;
type FieldError = NonNullable<ApiErrorBody['details']>[number];

const REF = { select: { id: true, name: true } } as const;

const SUMMARY_FIELDS = {
  id: true,
  invoiceNumber: true,
  invoiceDate: true,
  status: true,
  shopId: true,
  shopName: true,
  grandTotal: true,
  createdAt: true,
  order: { select: { id: true, orderNumber: true } },
  _count: { select: { items: true } },
} as const satisfies Prisma.InvoiceSelect;

const DETAIL_FIELDS = {
  ...SUMMARY_FIELDS,
  shopAddress: true,
  shopPhone: true,
  shopContactPerson: true,
  shopNtn: true,
  shopStrn: true,
  shopCnic: true,
  shopCategory: true,
  shopArea: true,
  distributorName: true,
  distributorAddress: true,
  distributorTown: true,
  distributorPhone: true,
  distributorNtn: true,
  distributorStrn: true,
  currency: true,
  totalValueExclTax: true,
  totalGstAmount: true,
  totalValueInclGst: true,
  totalTradeOffer: true,
  totalCost: true,
  advanceTax: true,
  furtherTax: true,
  adtDiscount: true,
  duePayment: true,
  payableValue: true,
  notes: true,
  createdBy: REF,
  cancelledAt: true,
  cancelledBy: REF,
  cancelReason: true,
  items: { orderBy: { lineNo: 'asc' } },
} as const satisfies Prisma.InvoiceSelect;

type SummaryRow = Prisma.InvoiceGetPayload<{ select: typeof SUMMARY_FIELDS }>;
type DetailRow = Prisma.InvoiceGetPayload<{ select: typeof DETAIL_FIELDS }>;

const SHOP_FIELDS = {
  id: true,
  name: true,
  address: true,
  phone: true,
  contactPerson: true,
  ntn: true,
  strn: true,
  cnic: true,
  isActive: true,
  area: { select: { name: true } },
  category: { select: { name: true } },
} as const satisfies Prisma.ShopSelect;

/** A row the calculator accepted, ready to be stored with its product snapshot. */
interface PricedLine {
  product: ProductRow;
  input: CreateInvoice['items'][number];
  calc: CalculatedInvoiceLine;
}

/**
 * Invoices (docs/invoice-specification.md, D-29). One creation path for direct and order-based
 * invoices. Every value is recomputed here with the shared calculator; totals sent by a client are
 * never read. Confirmed invoices are append-only (also enforced by database triggers).
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly ledger: ShopLedgerService,
  ) {}

  async list(query: ListInvoicesQuery): Promise<Paginated<InvoiceSummary>> {
    const where: Prisma.InvoiceWhereInput = {
      ...(query.shopId ? { shopId: query.shopId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { invoiceNumber: { contains: query.q, mode: 'insensitive' } },
              { shopName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.client.invoice.findMany({
        where,
        select: SUMMARY_FIELDS,
        orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.client.invoice.count({ where }),
    ]);
    return { items: rows.map(toSummary), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<InvoiceDetails> {
    const row = await this.db.client.invoice.findFirst({ where: { id }, select: DETAIL_FIELDS });
    if (!row) throw new NotFoundException('Invoice not found');
    return toDetails(row);
  }

  /**
   * What the invoice form opens with. From an order: its shop and products with the booked
   * quantities (TIN pieces → Qty Pcs; POUCH cartons → Qty Ctn, Qty Pcs = Qty Ctn × Pieces per
   * Carton) and the products' current prices. Direct: the shop and no rows.
   */
  async draft(query: InvoiceDraftQuery): Promise<InvoiceDraft> {
    const db = this.db.client;
    let shopId = query.shopId;
    let order: InvoiceDraft['order'] = null;
    let items: InvoiceDraft['items'] = [];

    if (query.orderId) {
      const row = await db.order.findFirst({
        where: { id: query.orderId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          shopId: true,
          items: {
            select: { quantity: true, quantityUnit: true, product: { select: PRODUCT_FIELDS } },
            orderBy: { product: { name: 'asc' } },
          },
        },
      });
      if (!row) throw new NotFoundException('Order not found');
      if (row.status !== 'PENDING') {
        throw new ConflictException(
          `Only pending orders can be invoiced (this order is ${row.status.toLowerCase()})`,
        );
      }
      shopId = row.shopId;
      order = { id: row.id, orderNumber: row.orderNumber };
      items = row.items.map(({ quantity, quantityUnit, product }) => ({
        product: toProduct(product),
        ...quantitiesFromOrder(product, quantity, quantityUnit),
      }));
    }

    const shop = await db.shop.findFirst({ where: { id: shopId }, select: SHOP_FIELDS });
    if (!shop) throw new NotFoundException('Shop not found');
    const organization = await db.organization.findFirstOrThrow({
      select: { timezone: true, defaultTaxRate: true },
    });
    const organizationId = this.tenant.requireOrganizationId();

    return {
      shop: {
        id: shop.id,
        name: shop.name,
        isActive: shop.isActive,
        address: shop.address,
        area: shop.area.name,
        category: shop.category?.name ?? null,
      },
      order,
      proposedInvoiceNumber: await peekDocumentNumber(db, organizationId, 'INVOICE'),
      invoiceDate: todayIn(organization.timezone),
      duePayment: await this.ledger.outstandingBalance(shop.id),
      defaultTaxRate: organization.defaultTaxRate.toString(),
      items,
    };
  }

  /** The values the server would store, without storing anything. */
  async preview(input: CreateInvoice): Promise<InvoicePreview> {
    const lines = await priceLines(this.db.client, input);
    const totals = calculateInvoiceTotals(lines.map((l) => l.calc));
    return {
      items: lines.map(({ product, calc }) => ({
        productId: product.id,
        qtyCtn: calc.qtyCtn,
        qtyPcs: calc.qtyPcs,
        totalWeight: calc.totalWeight,
        totalWeightUnit: calc.totalWeightUnit,
        valueExclTax: calc.valueExclTax,
        gstAmount: calc.gstAmount,
        valueInclGst: calc.valueInclGst,
        toAmount: calc.toAmount,
        atoAmount: calc.atoAmount,
        specialDiscount: calc.specialDiscount,
        totalTradeOffer: calc.totalTradeOffer,
        grossValue: calc.grossValue,
      })),
      totalValueExclTax: totals.totalValueExclTax,
      totalGstAmount: totals.totalGstAmount,
      totalValueInclGst: totals.totalValueInclGst,
      totalTradeOffer: totals.totalTradeOffer,
      grandTotal: totals.grandTotal,
    };
  }

  /**
   * Confirms an invoice in ONE transaction: (order PENDING → INVOICED) → invoice number →
   * products validated and priced → invoice + items with all snapshots → ledger hook. Any failure
   * rolls everything back: the order stays PENDING and the number is not used.
   */
  async create(input: CreateInvoice): Promise<InvoiceDetails> {
    const auth = this.tenant.require();
    const organizationId = this.tenant.requireOrganizationId();

    const id = await this.db.client.$transaction(async (tx) => {
      const shop = await tx.shop.findFirst({ where: { id: input.shopId }, select: SHOP_FIELDS });
      if (!shop) fail([{ path: 'shopId', message: 'Shop not found' }]);
      if (!shop.isActive) fail([{ path: 'shopId', message: 'This shop is inactive' }]);

      if (input.orderId) await claimOrder(tx, input.orderId, input.shopId);
      const invoiceNumber = await allocateDocumentNumber(tx, organizationId, 'INVOICE');
      const lines = await priceLines(tx, input);
      const totals = calculateInvoiceTotals(lines.map((l) => l.calc));
      const org = await tx.organization.findFirstOrThrow();

      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          invoiceNumber,
          invoiceDate: new Date(`${input.invoiceDate}T00:00:00Z`),
          shopId: shop.id,
          orderId: input.orderId ?? null,
          shopName: shop.name,
          shopAddress: shop.address,
          shopPhone: shop.phone,
          shopContactPerson: shop.contactPerson,
          shopNtn: shop.ntn,
          shopStrn: shop.strn,
          shopCnic: shop.cnic,
          shopCategory: shop.category?.name ?? null,
          shopArea: shop.area.name,
          distributorName: org.name,
          distributorAddress: org.address,
          distributorTown: org.town,
          distributorPhone: org.phone,
          distributorNtn: org.ntn,
          distributorStrn: org.strn,
          currency: org.currency,
          totalValueExclTax: totals.totalValueExclTax,
          totalGstAmount: totals.totalGstAmount,
          totalValueInclGst: totals.totalValueInclGst,
          totalTradeOffer: totals.totalTradeOffer,
          grandTotal: totals.grandTotal,
          totalCost: totals.totalCost ?? '0',
          advanceTax: optionalInvoiceAmount(input.advanceTax),
          furtherTax: optionalInvoiceAmount(input.furtherTax),
          adtDiscount: optionalInvoiceAmount(input.adtDiscount),
          // Due Payment is a printed snapshot only — the ledger never reads it (D-29).
          duePayment: input.duePayment ?? null,
          payableValue: optionalInvoiceAmount(input.payableValue),
          notes: input.notes ?? null,
          createdById: auth.userId,
        },
        select: {
          id: true,
          shopId: true,
          invoiceNumber: true,
          invoiceDate: true,
          grandTotal: true,
        },
      });

      await tx.invoiceItem.createMany({
        data: lines.map(({ product, input: line, calc }, index) => ({
          organizationId,
          invoiceId: invoice.id,
          lineNo: index + 1,
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          productType: product.type,
          retailPrice: line.retailPrice,
          tradePrice: line.tradePrice,
          invoiceCostPrice: product.invoiceCostPrice,
          piecesPerCarton: product.piecesPerCarton,
          weight: product.weight,
          weightUnit: product.weightUnit,
          weightBasis: product.weightBasis,
          qtyCtn: calc.qtyCtn,
          qtyPcs: calc.qtyPcs,
          totalWeight: calc.totalWeight,
          totalWeightUnit: calc.totalWeightUnit,
          gstRate: line.gstRate,
          valueExclTax: calc.valueExclTax,
          gstAmount: calc.gstAmount,
          valueInclGst: calc.valueInclGst,
          toRate: line.toRate,
          toAmount: calc.toAmount,
          atoRate: line.atoRate,
          atoAmount: calc.atoAmount,
          specialDiscount: calc.specialDiscount,
          totalTradeOffer: calc.totalTradeOffer,
          grossValue: calc.grossValue,
          costTotal: calc.costTotal ?? '0',
        })),
      });

      // The shop is debited with this invoice's own Grand Total, in the same transaction (D-30).
      await this.ledger.invoiceConfirmed(
        tx,
        { ...invoice, grandTotal: invoice.grandTotal.toFixed(2) },
        auth.userId,
      );
      return invoice.id;
    });
    return this.get(id);
  }

  /**
   * Admin cancels a confirmed invoice (D-16): it becomes CANCELLED with reason, user and time; all
   * its data stays. A linked order stays INVOICED (invoice-specification.md §1.6). In the same
   * transaction the ledger gets an INVOICE_REVERSAL credit equal to the original debit (D-30).
   */
  async cancel(id: string, reason: string): Promise<InvoiceDetails> {
    const auth = this.tenant.require();
    await this.db.client.$transaction(async (tx) => {
      const { count } = await tx.invoice.updateMany({
        where: { id, status: 'CONFIRMED' },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: auth.userId,
          cancelReason: reason,
        },
      });
      const invoice = await tx.invoice.findFirst({
        where: { id },
        select: {
          id: true,
          shopId: true,
          invoiceNumber: true,
          invoiceDate: true,
          grandTotal: true,
          status: true,
        },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (count === 0) throw new ConflictException('This invoice is already cancelled');
      await this.ledger.invoiceCancelled(
        tx,
        { ...invoice, grandTotal: invoice.grandTotal.toFixed(2) },
        auth.userId,
        reason,
      );
    });
    return this.get(id);
  }
}

function fail(details: FieldError[]): never {
  throw new UnprocessableEntityException({
    message: details.map((d) => d.message).join('. '),
    details,
  });
}

/**
 * Flips the order PENDING → INVOICED. The conditional update takes the order's row lock, so two
 * simultaneous invoices for one order cannot both succeed (the second sees it INVOICED → 409);
 * `Invoice.orderId` is also unique.
 */
async function claimOrder(tx: TenantTx, orderId: string, shopId: string): Promise<void> {
  const { count } = await tx.order.updateMany({
    where: { id: orderId, shopId, status: 'PENDING' },
    data: { status: 'INVOICED' },
  });
  if (count === 1) return;
  const order = await tx.order.findFirst({
    where: { id: orderId },
    select: { shopId: true, status: true },
  });
  if (!order) fail([{ path: 'orderId', message: 'Order not found' }]);
  if (order.shopId !== shopId) {
    fail([{ path: 'orderId', message: 'This order belongs to another shop' }]);
  }
  throw new ConflictException(
    `Only pending orders can be invoiced (this order is ${order.status.toLowerCase()})`,
  );
}

/**
 * Loads the products of the organization and runs the calculator on every row. Unknown, foreign
 * (hidden by the tenant client) or inactive products and calculator issues → 422 per field.
 */
async function priceLines(db: Db, input: CreateInvoice): Promise<PricedLine[]> {
  const ids = [...new Set(input.items.map((item) => item.productId))];
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: PRODUCT_FIELDS,
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const details: FieldError[] = [];
  const lines: PricedLine[] = [];

  input.items.forEach((item, index) => {
    const product = byId.get(item.productId);
    const path = (field: string) => `items.${index}.${field}`;
    if (!product) {
      details.push({ path: path('productId'), message: 'Product not found' });
      return;
    }
    if (!product.isActive) {
      details.push({ path: path('productId'), message: 'This product is inactive' });
      return;
    }
    const { line, issues } = calculateInvoiceLine(
      {
        type: product.type,
        piecesPerCarton: product.piecesPerCarton,
        weight: product.weight?.toString() ?? null,
        weightUnit: product.weightUnit,
        weightBasis: product.weightBasis,
      },
      {
        qtyCtn: item.qtyCtn,
        qtyPcs: item.qtyPcs,
        tradePrice: item.tradePrice,
        gstRate: item.gstRate,
        toRate: item.toRate,
        atoRate: item.atoRate,
        specialDiscount: item.specialDiscount,
        invoiceCostPrice: product.invoiceCostPrice.toFixed(2),
      },
    );
    for (const issue of issues) details.push({ path: path(issue.field), message: issue.message });
    if (line && issues.length === 0) lines.push({ product, input: item, calc: line });
  });

  if (details.length > 0) fail(details);
  return lines;
}

/** Order quantities → invoice quantities, by the unit stored on the order line (D-28). */
function quantitiesFromOrder(
  product: ProductRow,
  quantity: number,
  unit: 'PIECE' | 'CARTON',
): { qtyCtn: number | null; qtyPcs: number | null } {
  if (unit === 'CARTON') {
    if (product.type === 'POUCH') return initialQuantities(product, quantity);
    // booked as a POUCH, since changed to TIN: pieces when they can be worked out
    return {
      qtyCtn: null,
      qtyPcs: product.piecesPerCarton ? quantity * product.piecesPerCarton : null,
    };
  }
  // pieces: a TIN prices them; a product changed to POUCH needs its cartons entered by the Admin
  return { qtyCtn: null, qtyPcs: quantity };
}

/** Today's date (YYYY-MM-DD) in the organization's timezone. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const amount = (value: Prisma.Decimal) => value.toFixed(2);
const optional = (value: Prisma.Decimal | null) => (value === null ? null : value.toFixed(2));

function toSummary(row: SummaryRow): InvoiceSummary {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
    status: row.status,
    shop: { id: row.shopId, name: row.shopName },
    order: row.order,
    itemCount: row._count.items,
    grandTotal: amount(row.grandTotal),
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetails(row: DetailRow): InvoiceDetails {
  return {
    ...toSummary(row),
    shopSnapshot: {
      name: row.shopName,
      address: row.shopAddress,
      phone: row.shopPhone,
      contactPerson: row.shopContactPerson,
      ntn: row.shopNtn,
      strn: row.shopStrn,
      cnic: row.shopCnic,
      category: row.shopCategory,
      area: row.shopArea,
    },
    distributor: {
      name: row.distributorName,
      address: row.distributorAddress,
      town: row.distributorTown,
      phone: row.distributorPhone,
      ntn: row.distributorNtn,
      strn: row.distributorStrn,
    },
    currency: row.currency,
    items: row.items.map((item) => ({
      id: item.id,
      lineNo: item.lineNo,
      productId: item.productId,
      productCode: item.productCode,
      productName: item.productName,
      productType: item.productType,
      retailPrice: amount(item.retailPrice),
      tradePrice: amount(item.tradePrice),
      invoiceCostPrice: amount(item.invoiceCostPrice),
      piecesPerCarton: item.piecesPerCarton,
      weight: item.weight?.toString() ?? null,
      weightUnit: item.weightUnit,
      weightBasis: item.weightBasis,
      qtyCtn: item.qtyCtn,
      qtyPcs: item.qtyPcs,
      totalWeight: item.totalWeight.toFixed(3),
      totalWeightUnit: item.totalWeightUnit,
      gstRate: item.gstRate.toString(),
      valueExclTax: amount(item.valueExclTax),
      gstAmount: amount(item.gstAmount),
      valueInclGst: amount(item.valueInclGst),
      toRate: item.toRate.toString(),
      toAmount: amount(item.toAmount),
      atoRate: item.atoRate.toString(),
      atoAmount: amount(item.atoAmount),
      specialDiscount: amount(item.specialDiscount),
      totalTradeOffer: amount(item.totalTradeOffer),
      grossValue: amount(item.grossValue),
      costTotal: amount(item.costTotal),
    })),
    totalValueExclTax: amount(row.totalValueExclTax),
    totalGstAmount: amount(row.totalGstAmount),
    totalValueInclGst: amount(row.totalValueInclGst),
    totalTradeOffer: amount(row.totalTradeOffer),
    totalCost: amount(row.totalCost),
    advanceTax: optional(row.advanceTax),
    furtherTax: optional(row.furtherTax),
    adtDiscount: optional(row.adtDiscount),
    duePayment: optional(row.duePayment),
    payableValue: optional(row.payableValue),
    notes: row.notes,
    createdBy: row.createdBy,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledBy: row.cancelledBy,
    cancelReason: row.cancelReason,
  };
}
