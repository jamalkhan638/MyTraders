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
  type EditInvoice,
  initialQuantities,
  type InvoiceDetails,
  type InvoiceDraft,
  type InvoiceDraftQuery,
  type InvoicePreview,
  type InvoiceTotals,
  type InvoiceRevision,
  type InvoiceSummary,
  type ListInvoicesQuery,
  calculatePayableValue,
  calculateTotalPayable,
  optionalInvoiceAmount,
  type Paginated,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { allocateDocumentNumber, peekDocumentNumber } from '../../common/numbering/document-number';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { type TenantPrismaClient } from '../../prisma/tenant-scope';
import { ShopLedgerService } from '../ledger/shop-ledger.service';
import { PRODUCT_FIELDS, type ProductRow, toProduct } from '../products/products.service';
import { diffSnapshots, type InvoiceSnapshot, sameInputs, snapshotOf } from './invoice-snapshot';

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
  payableValue: true,
  editCount: true,
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
  notes: true,
  createdBy: REF,
  lastEditedAt: true,
  lastEditedBy: REF,
  revisions: {
    orderBy: { revisionNo: 'desc' },
    select: {
      id: true,
      revisionNo: true,
      reason: true,
      previousPayableValue: true,
      newPayableValue: true,
      previous: true,
      current: true,
      editedBy: REF,
      createdAt: true,
    },
  },
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
  area: { select: { id: true, name: true } },
  category: { select: { name: true } },
} as const satisfies Prisma.ShopSelect;

/** A row the calculator accepted, ready to be stored with its product snapshot. */
/** The product facts a line is priced and stored with (the master, or the edited line's snapshot). */
type LineProduct = Pick<
  ProductRow,
  | 'id'
  | 'code'
  | 'name'
  | 'type'
  | 'piecesPerCarton'
  | 'weight'
  | 'weightUnit'
  | 'weightBasis'
  | 'invoiceCostPrice'
  | 'isActive'
>;

interface PricedLine {
  product: LineProduct;
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
      ...(query.from || query.to
        ? {
            invoiceDate: {
              ...(query.from ? { gte: asDate(query.from) } : {}),
              ...(query.to ? { lte: asDate(query.to) } : {}),
            },
          }
        : {}),
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

  /** Several invoices for bulk printing, in the order asked; any id not in the org → 404. */
  async batch(ids: string[]): Promise<InvoiceDetails[]> {
    const unique = [...new Set(ids)];
    const rows = await this.db.client.invoice.findMany({
      where: { id: { in: unique } },
      select: DETAIL_FIELDS,
    });
    if (rows.length !== unique.length) throw new NotFoundException('Invoice not found');
    const byId = new Map(rows.map((r) => [r.id, toDetails(r)]));
    return unique.map((id) => byId.get(id)!);
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
    const payableValue = payableOf(totals.grandTotal, input);
    assertStorable(lines, totals, payableValue);
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
      payableValue,
      totalPayable: calculateTotalPayable({ payableValue, duePayment: input.duePayment }),
    };
  }

  /**
   * Confirms an invoice in ONE transaction: (order PENDING → INVOICED) → invoice number →
   * products validated and priced → invoice + items with all snapshots → ledger debit of the
   * Payable Value. Any failure
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
      const payableValue = payableOf(totals.grandTotal, input);
      assertStorable(lines, totals, payableValue);
      const org = await tx.organization.findFirstOrThrow();

      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          invoiceNumber,
          invoiceDate: asDate(input.invoiceDate),
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
          shopAreaId: shop.area.id,
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
          // Due Payment is a printed snapshot only — neither the ledger nor Payable Value reads it.
          duePayment: input.duePayment ?? null,
          // Grand Total + Advance Tax + Further Tax − ADT discount; never Due Payment (D-31)
          payableValue,
          notes: input.notes ?? null,
          createdById: auth.userId,
        },
        select: {
          id: true,
          shopId: true,
          invoiceNumber: true,
          invoiceDate: true,
          payableValue: true,
        },
      });

      await tx.invoiceItem.createMany({ data: itemRows(organizationId, invoice.id, lines) });

      // The shop is debited with this invoice's Payable Value, in the same transaction (D-30, D-31).
      await this.ledger.invoiceConfirmed(
        tx,
        { ...invoice, amount: invoice.payableValue.toFixed(2) },
        auth.userId,
      );
      return invoice.id;
    });
    return this.get(id);
  }

  /**
   * The invoice form, opened to edit a CONFIRMED invoice (D-41): the saved lines with their saved
   * prices / rates / quantities and the saved invoice-level values. Kept products carry the facts
   * they were invoiced with (name, type, weight, pieces per carton, cost), not today's master.
   */
  async editDraft(id: string): Promise<InvoiceDraft> {
    const invoice = await this.db.client.invoice.findFirst({
      where: { id },
      select: { ...DETAIL_FIELDS, shopId: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    assertEditable(invoice.status);
    const organization = await this.db.client.organization.findFirstOrThrow({
      select: { defaultTaxRate: true },
    });
    const at = invoice.createdAt.toISOString();
    return {
      shop: {
        id: invoice.shopId,
        name: invoice.shopName,
        // the shop of a confirmed invoice never changes; editing does not depend on it being active
        isActive: true,
        address: invoice.shopAddress,
        area: invoice.shopArea,
        category: invoice.shopCategory,
      },
      order: invoice.order,
      proposedInvoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      duePayment: optional(invoice.duePayment),
      defaultTaxRate: organization.defaultTaxRate.toString(),
      items: invoice.items.map((item) => ({
        product: {
          id: item.productId,
          name: item.productName,
          code: item.productCode,
          type: item.productType,
          retailPrice: amount(item.retailPrice),
          tradePrice: amount(item.tradePrice),
          invoiceCostPrice: amount(item.invoiceCostPrice),
          defaultTaxRate: item.gstRate.toString(),
          weight: item.weight?.toString() ?? null,
          weightUnit: item.weightUnit,
          weightBasis: item.weightBasis,
          piecesPerCarton: item.piecesPerCarton,
          isActive: true,
          createdAt: at,
          updatedAt: at,
        },
        qtyCtn: item.qtyCtn,
        qtyPcs: item.qtyPcs,
        values: {
          retailPrice: amount(item.retailPrice),
          tradePrice: amount(item.tradePrice),
          gstRate: item.gstRate.toString(),
          toRate: item.toRate.toString(),
          atoRate: item.atoRate.toString(),
          specialDiscount: amount(item.specialDiscount),
        },
      })),
      edit: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        editCount: invoice.editCount,
        payableValue: amount(invoice.payableValue),
        advanceTax: optional(invoice.advanceTax),
        furtherTax: optional(invoice.furtherTax),
        adtDiscount: optional(invoice.adtDiscount),
        notes: invoice.notes,
      },
    };
  }

  /**
   * Admin edits a CONFIRMED invoice (D-41), in ONE transaction:
   *   lock the invoice → recompute every value with the shared calculator → InvoiceRevision
   *   (reason, who, before / after) → update the invoice (same id, number, shop, order, creation
   *   date and header snapshots) and replace its lines → ledger: INVOICE_EDIT_REVERSAL credit of the
   *   old Invoice Value + INVOICE_EDIT debit of the new one (nothing in the ledger is changed or
   *   deleted). Refused when the shop's balance would become negative. Reports, dashboard and
   *   profit read the invoice, so they show the corrected values at once.
   */
  async edit(id: string, input: EditInvoice): Promise<InvoiceDetails> {
    const auth = this.tenant.require();
    const organizationId = this.tenant.requireOrganizationId();

    await this.db.client.$transaction(async (tx) => {
      // Row lock: a concurrent edit / cancel of this invoice waits for this transaction.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Invoice"
        WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Invoice not found');
      const invoice = await tx.invoice.findFirstOrThrow({
        where: { id },
        select: {
          id: true,
          status: true,
          shopId: true,
          invoiceNumber: true,
          editCount: true,
          invoiceDate: true,
          advanceTax: true,
          furtherTax: true,
          adtDiscount: true,
          duePayment: true,
          notes: true,
          grandTotal: true,
          payableValue: true,
          totalCost: true,
          items: { orderBy: { lineNo: 'asc' } },
        },
      });
      assertEditable(invoice.status);

      const kept = new Map<string, LineProduct>();
      for (const item of invoice.items) {
        if (kept.has(item.productId)) continue;
        kept.set(item.productId, {
          id: item.productId,
          code: item.productCode,
          name: item.productName,
          type: item.productType,
          piecesPerCarton: item.piecesPerCarton,
          weight: item.weight,
          weightUnit: item.weightUnit,
          weightBasis: item.weightBasis,
          invoiceCostPrice: item.invoiceCostPrice,
          isActive: true,
        });
      }
      const lines = await priceLines(tx, input, kept);
      const totals = calculateInvoiceTotals(lines.map((l) => l.calc));
      const payableValue = payableOf(totals.grandTotal, input);
      assertStorable(lines, totals, payableValue);

      const values = {
        invoiceDate: asDate(input.invoiceDate),
        totalValueExclTax: totals.totalValueExclTax,
        totalGstAmount: totals.totalGstAmount,
        totalValueInclGst: totals.totalValueInclGst,
        totalTradeOffer: totals.totalTradeOffer,
        grandTotal: totals.grandTotal,
        totalCost: totals.totalCost ?? '0',
        advanceTax: optionalInvoiceAmount(input.advanceTax),
        furtherTax: optionalInvoiceAmount(input.furtherTax),
        adtDiscount: optionalInvoiceAmount(input.adtDiscount),
        duePayment: input.duePayment ?? null,
        payableValue,
        notes: input.notes ?? null,
      };
      const rows = itemRows(organizationId, invoice.id, lines);
      const before = snapshotOf(invoice, invoice.items);
      const after = snapshotOf(
        {
          ...values,
          advanceTax: decimalOrNull(values.advanceTax),
          furtherTax: decimalOrNull(values.furtherTax),
          adtDiscount: decimalOrNull(values.adtDiscount),
          duePayment: decimalOrNull(values.duePayment),
          grandTotal: new Prisma.Decimal(values.grandTotal),
          payableValue: new Prisma.Decimal(values.payableValue),
          totalCost: new Prisma.Decimal(values.totalCost),
        },
        rows.map((row) => ({
          ...row,
          retailPrice: new Prisma.Decimal(row.retailPrice),
          tradePrice: new Prisma.Decimal(row.tradePrice),
          gstRate: new Prisma.Decimal(row.gstRate),
          toRate: new Prisma.Decimal(row.toRate),
          atoRate: new Prisma.Decimal(row.atoRate),
          specialDiscount: new Prisma.Decimal(row.specialDiscount),
          grossValue: new Prisma.Decimal(row.grossValue),
        })),
      );
      if (sameInputs(before, after)) {
        fail([{ path: 'items', message: 'Nothing was changed — there is nothing to save' }]);
      }

      // Lets the invoice triggers accept this edit (values and lines only) until the commit.
      await tx.$queryRaw`SELECT set_config('mytraders.invoice_edit', 'on', true)`;

      const revision = await tx.invoiceRevision.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          revisionNo: invoice.editCount + 1,
          reason: input.reason,
          previousPayableValue: before.payableValue,
          newPayableValue: payableValue,
          previous: before as unknown as Prisma.InputJsonObject,
          current: after as unknown as Prisma.InputJsonObject,
          editedById: auth.userId,
        },
        select: { id: true, revisionNo: true },
      });
      const { count } = await tx.invoice.updateMany({
        where: { id: invoice.id, status: 'CONFIRMED' },
        data: {
          ...values,
          editCount: { increment: 1 },
          lastEditedAt: new Date(),
          lastEditedById: auth.userId,
        },
      });
      if (count !== 1) throw new ConflictException('This invoice can no longer be edited');
      await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceItem.createMany({ data: rows });

      // Old value reversed, new value applied — refused if the shop's balance would go below 0.
      await this.ledger.invoiceEdited(
        tx,
        {
          invoiceId: invoice.id,
          shopId: invoice.shopId,
          invoiceNumber: invoice.invoiceNumber,
          revisionId: revision.id,
          revisionNo: revision.revisionNo,
          previousAmount: before.payableValue,
          newAmount: payableValue,
          reason: input.reason,
        },
        auth.userId,
      );
    });
    return this.get(id);
  }

  /**
   * Admin cancels a confirmed invoice (D-16): it becomes CANCELLED with reason, user and time; all
   * its data stays. A linked order stays INVOICED (invoice-specification.md §1.6). In the same
   * transaction the ledger gets an INVOICE_REVERSAL credit equal to what the invoice still owes in the
   * ledger — its debit, adjusted by any edits (D-30, D-41).
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
          payableValue: true,
          status: true,
        },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (count === 0) throw new ConflictException('This invoice is already cancelled');
      // Refused (and the cancel rolled back) if the reversal would leave the shop owing < 0.
      await this.ledger.invoiceCancelled(
        tx,
        { ...invoice, amount: invoice.payableValue.toFixed(2) },
        auth.userId,
        reason,
      );
    });
    return this.get(id);
  }
}

function assertEditable(status: string): void {
  if (status !== 'CONFIRMED') {
    throw new ConflictException('A cancelled invoice cannot be edited');
  }
}

const asDate = (value: string) => new Date(`${value}T00:00:00Z`);
const decimalOrNull = (value: string | null) => (value === null ? null : new Prisma.Decimal(value));

/** Payable Value of an invoice; refused when the invoice-level discount makes it negative. */
function payableOf(
  grandTotal: string,
  input: Pick<CreateInvoice, 'advanceTax' | 'furtherTax' | 'adtDiscount'>,
): string {
  const payable = calculatePayableValue({ grandTotal, ...input });
  if (payable.startsWith('-')) {
    fail([
      {
        path: 'adtDiscount',
        message:
          'ADT / special discount cannot be more than Grand Total + Advance Tax + Further Tax',
      },
    ]);
  }
  return payable;
}

/** Invoice lines as stored: the calculated values plus the product snapshot. */
function itemRows(organizationId: string, invoiceId: string, lines: PricedLine[]) {
  return lines.map(({ product, input: line, calc }, index) => ({
    organizationId,
    invoiceId,
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
  }));
}

/** Column limits: money numeric(14,2) and weight numeric(14,3) hold values below these. */
const MONEY_LIMIT = new Prisma.Decimal('1e12');
const WEIGHT_LIMIT = new Prisma.Decimal('1e11');
const exceeds = (value: string | null, limit: Prisma.Decimal) =>
  value !== null && new Prisma.Decimal(value).abs().greaterThanOrEqualTo(limit);

/**
 * Every calculated value must fit its database column. Inputs are bounded one by one, but a
 * large quantity × price (or many large lines) can exceed the column — refuse that with a 422
 * on the line / invoice instead of failing inside the database.
 */
function assertStorable(lines: PricedLine[], totals: InvoiceTotals, payableValue: string): void {
  const errors: FieldError[] = [];
  lines.forEach(({ calc }, index) => {
    const money = [
      calc.valueExclTax,
      calc.gstAmount,
      calc.valueInclGst,
      calc.toAmount,
      calc.atoAmount,
      calc.totalTradeOffer,
      calc.grossValue,
      calc.costTotal,
    ];
    if (money.some((v) => exceeds(v, MONEY_LIMIT)) || exceeds(calc.totalWeight, WEIGHT_LIMIT)) {
      errors.push({
        path: `items.${index}`,
        message: `Line ${index + 1}: the quantity or price is too large`,
      });
    }
  });
  const invoiceMoney = [
    totals.totalValueExclTax,
    totals.totalGstAmount,
    totals.totalValueInclGst,
    totals.totalTradeOffer,
    totals.grandTotal,
    totals.totalCost,
    payableValue,
  ];
  if (errors.length === 0 && invoiceMoney.some((v) => exceeds(v, MONEY_LIMIT))) {
    errors.push({ path: 'items', message: 'The invoice total is too large' });
  }
  if (errors.length > 0) fail(errors);
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
async function priceLines(
  db: Db,
  input: Pick<CreateInvoice, 'items'>,
  /** editing (D-41): products already on the invoice keep the facts they were invoiced with */
  kept: Map<string, LineProduct> = new Map(),
): Promise<PricedLine[]> {
  const ids = [...new Set(input.items.map((item) => item.productId))].filter((id) => !kept.has(id));
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: PRODUCT_FIELDS,
  });
  const byId = new Map<string, LineProduct>([...products.map((p) => [p.id, p] as const), ...kept]);
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
    payableValue: amount(row.payableValue),
    editCount: row.editCount,
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
    payableValue: amount(row.payableValue),
    totalPayable: calculateTotalPayable({
      payableValue: amount(row.payableValue),
      duePayment: optional(row.duePayment),
    }),
    notes: row.notes,
    createdBy: row.createdBy,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledBy: row.cancelledBy,
    cancelReason: row.cancelReason,
    lastEditedAt: row.lastEditedAt?.toISOString() ?? null,
    lastEditedBy: row.lastEditedBy,
    revisions: row.revisions.map((r): InvoiceRevision => ({
      id: r.id,
      revisionNo: r.revisionNo,
      reason: r.reason,
      previousPayableValue: amount(r.previousPayableValue),
      newPayableValue: amount(r.newPayableValue),
      changes: diffSnapshots(
        r.previous as unknown as InvoiceSnapshot,
        r.current as unknown as InvoiceSnapshot,
      ),
      editedBy: r.editedBy,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
