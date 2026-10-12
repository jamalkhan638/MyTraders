-- D-42: deleting (voiding) a confirmed invoice. Enum values in their own migration: a new value
-- cannot be used in the transaction that adds it.
ALTER TYPE "InvoiceStatus" ADD VALUE 'VOIDED';
ALTER TYPE "LedgerEntryType" ADD VALUE 'INVOICE_VOID_REVERSAL';
