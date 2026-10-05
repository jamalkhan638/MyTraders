import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type AdjustCredit,
  type AreaLedger,
  type AreaLedgerQuery,
  type LedgerEntry,
  type LedgerEntryType,
  type LedgerPosting,
  type MarketCredit,
  type PaymentMethod,
  type RecordPayment,
  type ShopBalance,
  type ShopLedger,
} from '@mytraders/shared-types';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../common/tenant/tenant-context';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { type TenantPrismaClient } from '../../prisma/tenant-scope';

type TenantTx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];
type Db = TenantPrismaClient | TenantTx;
const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** What the ledger needs to know about an invoice. */
export interface LedgerInvoice {
  id: string;
  shopId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  /** the invoice's Payable Value — the amount debited (D-31) */
  amount: string;
}

interface EntryRow {
  id: string;
  type: LedgerEntryType;
  transactionDate: Date;
  debit: string;
  credit: string;
  runningBalance: string;
  notes: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  paymentId: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
}

const money = (value: Decimal) => value.toFixed(2);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * Shop ledger — the single source of truth for shop credit (D-30).
 *
 *   Outstanding Balance = Σ debitAmount − Σ creditAmount
 *   INVOICE           debit   (confirmed invoice, its Grand Total)
 *   PAYMENT           credit  (money received)
 *   MANUAL_ADJUSTMENT debit (increase) | credit (decrease), with a reason
 *   INVOICE_REVERSAL  credit  (cancelled invoice, exactly its debit)
 *
 * Entries are append-only (database trigger). There is no balance column anywhere; every balance,
 * running balance and area sheet is computed from the entries. Every raw query filters on the
 * current organization explicitly (raw SQL bypasses the tenant client's automatic scoping).
 */
@Injectable()
export class ShopLedgerService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  // ---- balances ------------------------------------------------------------------------------

  /** Current balance of one shop (the shop must be in the organization). */
  async balance(shopId: string, db: Db = this.db.client): Promise<ShopBalance> {
    const sums = await db.shopLedgerEntry.aggregate({
      where: { shopId },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const debit = sums._sum.debitAmount ?? new Decimal(0);
    const credit = sums._sum.creditAmount ?? new Decimal(0);
    return {
      shopId,
      outstandingBalance: money(debit.minus(credit)),
      totalDebit: money(debit),
      totalCredit: money(credit),
    };
  }

  /** Balances of many shops in one grouped query (shop lists — no N+1). Missing → "0.00". */
  async balances(shopIds: string[]): Promise<Map<string, string>> {
    if (shopIds.length === 0) return new Map();
    const groups = await this.db.client.shopLedgerEntry.groupBy({
      by: ['shopId'],
      where: { shopId: { in: shopIds } },
      _sum: { debitAmount: true, creditAmount: true },
    });
    const result = new Map(shopIds.map((id) => [id, '0.00']));
    for (const g of groups) {
      const debit = g._sum.debitAmount ?? new Decimal(0);
      const credit = g._sum.creditAmount ?? new Decimal(0);
      result.set(g.shopId, money(debit.minus(credit)));
    }
    return result;
  }

  /** Invoice form: Due Payment defaults to the shop's current outstanding balance. */
  async outstandingBalance(shopId: string): Promise<string> {
    return (await this.balance(shopId)).outstandingBalance;
  }

  /** Total Market Credit = Σ outstanding of every shop of the organization (Dashboard, later). */
  async marketCredit(): Promise<MarketCredit> {
    const organizationId = this.tenant.requireOrganizationId();
    const [row] = await this.db.client.$queryRaw<{ total: string; shops: number }[]>`
      SELECT COALESCE(SUM(balance), 0)::text AS total,
             COUNT(*) FILTER (WHERE balance > 0)::int AS shops
      FROM (
        SELECT SUM("debitAmount" - "creditAmount") AS balance
        FROM "ShopLedgerEntry"
        WHERE "organizationId" = ${organizationId}::uuid
        GROUP BY "shopId"
      ) per_shop`;
    return { marketCredit: money(new Decimal(row.total)), shopsWithBalance: row.shops };
  }

  // ---- history -------------------------------------------------------------------------------

  /** Shop credit history, newest first, with the running balance after each entry. */
  async history(shopId: string, page: number, pageSize: number): Promise<ShopLedger> {
    await this.requireShop(shopId);
    const organizationId = this.tenant.requireOrganizationId();
    const [rows, total, balance] = await Promise.all([
      this.entries(this.db.client, organizationId, Prisma.sql`e."shopId" = ${shopId}::uuid`, {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      this.db.client.shopLedgerEntry.count({ where: { shopId } }),
      this.balance(shopId),
    ]);
    return { items: rows.map(toEntry), total, page, pageSize, balance };
  }

  // ---- postings ------------------------------------------------------------------------------

  /** Admin records money received: Payment + PAYMENT credit, never above the current balance. */
  async recordPayment(shopId: string, input: RecordPayment): Promise<LedgerPosting> {
    const auth = this.tenant.require();
    const organizationId = this.tenant.requireOrganizationId();
    const entryId = await this.db.client.$transaction(async (tx) => {
      await this.lockShop(tx, organizationId, shopId);
      await this.assertNotFuture(tx, 'paymentDate', input.paymentDate);
      await this.assertCreditAllowed(
        tx,
        organizationId,
        shopId,
        input.paymentDate,
        input.amount,
        'Payment',
      );
      const payment = await tx.payment.create({
        data: {
          organizationId,
          shopId,
          amount: input.amount,
          paymentDate: asDate(input.paymentDate),
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          createdById: auth.userId,
        },
        select: { id: true },
      });
      const entry = await tx.shopLedgerEntry.create({
        data: {
          organizationId,
          shopId,
          type: 'PAYMENT',
          creditAmount: input.amount,
          transactionDate: asDate(input.paymentDate),
          paymentId: payment.id,
          notes: input.notes ?? null,
          createdById: auth.userId,
        },
        select: { id: true },
      });
      return entry.id;
    });
    return this.posting(shopId, entryId);
  }

  /** Admin corrects a balance with a reasoned MANUAL_ADJUSTMENT (never overwrites a balance). */
  async adjust(shopId: string, input: AdjustCredit): Promise<LedgerPosting> {
    const auth = this.tenant.require();
    const organizationId = this.tenant.requireOrganizationId();
    const entryId = await this.db.client.$transaction(async (tx) => {
      await this.lockShop(tx, organizationId, shopId);
      await this.assertNotFuture(tx, 'adjustmentDate', input.adjustmentDate);
      if (input.direction === 'DECREASE') {
        await this.assertCreditAllowed(
          tx,
          organizationId,
          shopId,
          input.adjustmentDate,
          input.amount,
          'A decrease',
        );
      }
      const entry = await tx.shopLedgerEntry.create({
        data: {
          organizationId,
          shopId,
          type: 'MANUAL_ADJUSTMENT',
          debitAmount: input.direction === 'INCREASE' ? input.amount : '0',
          creditAmount: input.direction === 'DECREASE' ? input.amount : '0',
          transactionDate: asDate(input.adjustmentDate),
          notes: input.reason,
          createdById: auth.userId,
        },
        select: { id: true },
      });
      return entry.id;
    });
    return this.posting(shopId, entryId);
  }

  // ---- invoice integration (called inside the invoice transactions) --------------------------

  /**
   * Confirming an invoice debits the shop with the invoice's Payable Value (Grand Total + Advance
   * Tax + Further Tax − ADT discount, from the confirmed invoice — never Due Payment, never current
   * product data), on the invoice date. Runs in the confirm
   * transaction, so invoice and debit commit or fail together; `@@unique([invoiceId, type])`
   * makes a second debit for the same invoice impossible. A zero-value invoice posts nothing.
   */
  async invoiceConfirmed(tx: TenantTx, invoice: LedgerInvoice, userId: string): Promise<void> {
    if (!new Decimal(invoice.amount).greaterThan(0)) return;
    await tx.shopLedgerEntry.create({
      data: {
        organizationId: this.tenant.requireOrganizationId(),
        shopId: invoice.shopId,
        type: 'INVOICE',
        debitAmount: invoice.amount,
        transactionDate: invoice.invoiceDate,
        invoiceId: invoice.id,
        notes: `Invoice ${invoice.invoiceNumber}`,
        createdById: userId,
      },
    });
  }

  /**
   * Cancelling an invoice keeps its debit and adds an INVOICE_REVERSAL credit of exactly the same
   * amount, dated the cancellation day. Runs in the cancel transaction; the unique index makes a
   * second reversal impossible. Negative (advance) balances are not supported in the MVP: if the
   * reversal would take the shop's current balance below zero, the cancellation is refused.
   */
  async invoiceCancelled(
    tx: TenantTx,
    invoice: LedgerInvoice,
    userId: string,
    reason: string,
  ): Promise<void> {
    const organizationId = this.tenant.requireOrganizationId();
    await this.lockShop(tx, organizationId, invoice.shopId);
    const debit = await tx.shopLedgerEntry.findFirst({
      where: { invoiceId: invoice.id, type: 'INVOICE' },
      select: { debitAmount: true },
    });
    if (!debit) return;
    const { outstandingBalance } = await this.balance(invoice.shopId, tx);
    const after = new Decimal(outstandingBalance).minus(debit.debitAmount);
    if (after.isNegative()) {
      throw new ConflictException(
        `Cannot cancel invoice ${invoice.invoiceNumber}: the shop's balance would become ` +
          `${money(after)} (it owes ${outstandingBalance}, the invoice is ${money(debit.debitAmount)}). ` +
          'Payments already cover this invoice — correct the related payment or adjustment first ' +
          '(e.g. Adjust Credit → Increase), then cancel.',
      );
    }
    await tx.shopLedgerEntry.create({
      data: {
        organizationId,
        shopId: invoice.shopId,
        type: 'INVOICE_REVERSAL',
        creditAmount: debit.debitAmount,
        transactionDate: asDate(await this.today(tx)),
        invoiceId: invoice.id,
        notes: `Invoice ${invoice.invoiceNumber} cancelled: ${reason}`,
        createdById: userId,
      },
    });
  }

  // ---- area collection sheet -----------------------------------------------------------------

  /**
   * The area's collection sheet for one date, aggregated from shop ledger entries (no area
   * balances are stored). Lists the area's active shops plus inactive ones that have entries.
   */
  async areaLedger(areaId: string, query: AreaLedgerQuery): Promise<AreaLedger> {
    const area = await this.db.client.area.findFirst({
      where: { id: areaId },
      select: { id: true, name: true },
    });
    if (!area) throw new NotFoundException('Area not found');
    const organizationId = this.tenant.requireOrganizationId();
    const date = query.date;
    const search = query.q ? `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

    const rows = await this.db.client.$queryRaw<
      {
        id: string;
        name: string;
        isActive: boolean;
        opening: string;
        dayDebit: string;
        dayOtherCredit: string;
        payments: string;
        closing: string;
        current: string;
        lastPaymentDate: Date | null;
        entries: number;
      }[]
    >`
      SELECT s."id", s."name", s."isActive",
        COALESCE(SUM(l."debitAmount" - l."creditAmount") FILTER (WHERE l."transactionDate" < ${date}::date), 0)::text AS "opening",
        COALESCE(SUM(l."debitAmount") FILTER (WHERE l."transactionDate" = ${date}::date), 0)::text AS "dayDebit",
        COALESCE(SUM(l."creditAmount") FILTER (WHERE l."transactionDate" = ${date}::date AND l."type" <> 'PAYMENT'), 0)::text AS "dayOtherCredit",
        COALESCE(SUM(l."creditAmount") FILTER (WHERE l."transactionDate" = ${date}::date AND l."type" = 'PAYMENT'), 0)::text AS "payments",
        COALESCE(SUM(l."debitAmount" - l."creditAmount") FILTER (WHERE l."transactionDate" <= ${date}::date), 0)::text AS "closing",
        COALESCE(SUM(l."debitAmount" - l."creditAmount"), 0)::text AS "current",
        MAX(l."transactionDate") FILTER (WHERE l."type" = 'PAYMENT' AND l."transactionDate" <= ${date}::date) AS "lastPaymentDate",
        COUNT(l."id")::int AS "entries"
      FROM "Shop" s
      LEFT JOIN "ShopLedgerEntry" l
        ON l."shopId" = s."id" AND l."organizationId" = ${organizationId}::uuid
      WHERE s."organizationId" = ${organizationId}::uuid
        AND s."areaId" = ${areaId}::uuid
        AND (${search}::text IS NULL OR s."name" ILIKE ${search})
      GROUP BY s."id"
      ORDER BY s."name", s."id"`;

    const visible = rows.filter((r) => {
      if (!r.isActive && r.entries === 0) return false;
      if (!query.outstandingOnly) return true;
      return !isZero(r.opening) || !isZero(r.closing) || !isZero(r.payments);
    });
    const sum = (pick: (r: (typeof rows)[number]) => string) =>
      money(visible.reduce((acc, r) => acc.plus(pick(r)), new Decimal(0)));

    return {
      area,
      date,
      rows: visible.map((r) => ({
        shop: { id: r.id, name: r.name, isActive: r.isActive },
        openingBalance: money(new Decimal(r.opening)),
        dayDebit: money(new Decimal(r.dayDebit)),
        dayOtherCredit: money(new Decimal(r.dayOtherCredit)),
        payments: money(new Decimal(r.payments)),
        closingBalance: money(new Decimal(r.closing)),
        currentBalance: money(new Decimal(r.current)),
        lastPaymentDate: r.lastPaymentDate ? isoDate(r.lastPaymentDate) : null,
      })),
      totals: {
        openingBalance: sum((r) => r.opening),
        dayDebit: sum((r) => r.dayDebit),
        dayOtherCredit: sum((r) => r.dayOtherCredit),
        payments: sum((r) => r.payments),
        closingBalance: sum((r) => r.closing),
      },
    };
  }

  // ---- helpers -------------------------------------------------------------------------------

  /** Today's business date in the organization's timezone. */
  async today(db: Db = this.db.client): Promise<string> {
    const org = await db.organization.findFirstOrThrow({ select: { timezone: true } });
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: org.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private async posting(shopId: string, entryId: string): Promise<LedgerPosting> {
    const organizationId = this.tenant.requireOrganizationId();
    const [row] = await this.entries(
      this.db.client,
      organizationId,
      Prisma.sql`e."shopId" = ${shopId}::uuid`,
      { only: entryId },
    );
    return { entry: toEntry(row), balance: await this.balance(shopId) };
  }

  /**
   * Ledger rows with their running balance. The window orders by (transactionDate, createdAt, id)
   * — deterministic, so the same history always gives the same running balances.
   */
  private entries(
    db: Db,
    organizationId: string,
    filter: Prisma.Sql,
    page: { limit?: number; offset?: number; only?: string },
  ): Promise<EntryRow[]> {
    return db.$queryRaw<EntryRow[]>`
      WITH e AS (
        SELECT e.*,
          SUM(e."debitAmount" - e."creditAmount") OVER (
            ORDER BY e."transactionDate", e."createdAt", e."id"
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS "running"
        FROM "ShopLedgerEntry" e
        WHERE e."organizationId" = ${organizationId}::uuid AND ${filter}
      )
      SELECT e."id", e."type", e."transactionDate",
        e."debitAmount"::text AS "debit", e."creditAmount"::text AS "credit",
        e."running"::text AS "runningBalance", e."notes",
        e."invoiceId", i."invoiceNumber",
        e."paymentId", p."method" AS "paymentMethod", p."reference" AS "paymentReference",
        e."createdById", u."name" AS "createdByName", e."createdAt"
      FROM e
      LEFT JOIN "Invoice" i ON i."id" = e."invoiceId"
      LEFT JOIN "Payment" p ON p."id" = e."paymentId"
      JOIN "User" u ON u."id" = e."createdById"
      ${page.only ? Prisma.sql`WHERE e."id" = ${page.only}::uuid` : Prisma.empty}
      ORDER BY e."transactionDate" DESC, e."createdAt" DESC, e."id" DESC
      ${page.limit !== undefined ? Prisma.sql`LIMIT ${page.limit} OFFSET ${page.offset ?? 0}` : Prisma.empty}`;
  }

  private async requireShop(shopId: string): Promise<void> {
    const shop = await this.db.client.shop.findFirst({
      where: { id: shopId },
      select: { id: true },
    });
    if (!shop) throw new NotFoundException('Shop not found');
  }

  /**
   * Locks the shop row for the rest of the transaction (scoped to the organization), so payments,
   * decreases and reversals on one shop are serialized and a balance check cannot be raced.
   */
  private async lockShop(tx: TenantTx, organizationId: string, shopId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Shop"
      WHERE "id" = ${shopId}::uuid AND "organizationId" = ${organizationId}::uuid
      FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Shop not found');
  }

  /**
   * A payment or decrease dated D is a credit inserted at D. It may not exceed what the shop owed
   * on D (all entries up to and including D), nor make any later running balance negative — so a
   * backdated credit can never create a negative balance anywhere in the history.
   */
  private async assertCreditAllowed(
    tx: TenantTx,
    organizationId: string,
    shopId: string,
    date: string,
    amount: string,
    what: string,
  ): Promise<void> {
    const [row] = await tx.$queryRaw<{ asOf: string; minAfter: string | null }[]>`
      WITH r AS (
        SELECT "transactionDate",
          SUM("debitAmount" - "creditAmount") OVER (
            ORDER BY "transactionDate", "createdAt", "id"
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS "running",
          ROW_NUMBER() OVER (ORDER BY "transactionDate", "createdAt", "id") AS "position"
        FROM "ShopLedgerEntry"
        WHERE "organizationId" = ${organizationId}::uuid AND "shopId" = ${shopId}::uuid
      )
      SELECT
        COALESCE((SELECT "running" FROM r WHERE "transactionDate" <= ${date}::date
                  ORDER BY "position" DESC LIMIT 1), 0)::text AS "asOf",
        (SELECT MIN("running") FROM r WHERE "transactionDate" > ${date}::date)::text AS "minAfter"`;
    const credit = new Decimal(amount);
    const asOf = new Decimal(row.asOf);
    if (credit.greaterThan(asOf)) {
      fail('amount', `${what} cannot be more than the shop's balance on ${date} (${money(asOf)})`);
    }
    if (row.minAfter !== null && credit.greaterThan(row.minAfter)) {
      fail(
        'amount',
        `${what} on ${date} would make the shop's balance negative later ` +
          `(lowest balance after that date: ${money(new Decimal(row.minAfter))})`,
      );
    }
  }

  private async assertNotFuture(tx: TenantTx, field: string, date: string): Promise<void> {
    if (date > (await this.today(tx))) fail(field, 'The date cannot be in the future');
  }
}

function isZero(value: string): boolean {
  return new Decimal(value).isZero();
}

function fail(path: string, message: string): never {
  throw new UnprocessableEntityException({ message, details: [{ path, message }] });
}

function toEntry(row: EntryRow): LedgerEntry {
  return {
    id: row.id,
    type: row.type,
    transactionDate: isoDate(row.transactionDate),
    debit: money(new Decimal(row.debit)),
    credit: money(new Decimal(row.credit)),
    runningBalance: money(new Decimal(row.runningBalance)),
    notes: row.notes,
    invoice: row.invoiceId ? { id: row.invoiceId, invoiceNumber: row.invoiceNumber ?? '' } : null,
    payment: row.paymentId
      ? { id: row.paymentId, method: row.paymentMethod!, reference: row.paymentReference }
      : null,
    createdBy: { id: row.createdById, name: row.createdByName },
    createdAt: row.createdAt.toISOString(),
  };
}
