import { Injectable } from '@nestjs/common';
import { type TenantPrismaClient } from '../../prisma/tenant-scope';

type TenantTx = Parameters<Parameters<TenantPrismaClient['$transaction']>[0]>[0];

/** What the ledger needs to know about an invoice. */
export interface LedgerInvoice {
  id: string;
  shopId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  grandTotal: string;
}

/**
 * The single integration point between invoices and the shop ledger (Phase 5, D-29).
 *
 * There is deliberately **no** credit field on Shop and no temporary balance anywhere: until the
 * Shop Ledger module is built, a shop has no known outstanding balance (`null`), confirming an
 * invoice posts nothing and cancelling reverses nothing. Phase 5 implements these three methods
 * against `ShopLedgerEntry` — the invoice service already calls them inside its transactions.
 *
 * Note: the invoice's `duePayment` is only a printed snapshot. Nothing here ever reads it, so
 * editing Due Payment on an invoice can never change the ledger.
 */
@Injectable()
export class ShopLedgerPort {
  /** The shop's outstanding balance before a new invoice (prefills Due Payment). */
  async outstandingBalance(_shopId: string): Promise<string | null> {
    return null;
  }

  /** Called in the invoice-confirm transaction. Phase 5: debit the shop with the invoice amount. */
  async invoiceConfirmed(_tx: TenantTx, _invoice: LedgerInvoice): Promise<void> {}

  /** Called in the cancel transaction. Phase 5: credit back exactly the original debit (D-16). */
  async invoiceCancelled(_tx: TenantTx, _invoice: LedgerInvoice): Promise<void> {}
}
