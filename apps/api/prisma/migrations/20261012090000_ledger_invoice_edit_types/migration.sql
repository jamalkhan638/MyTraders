-- D-41: ledger entry types for editing a confirmed invoice. In their own migration: a new enum
-- value cannot be used (e.g. in a CHECK) in the transaction that adds it.
ALTER TYPE "LedgerEntryType" ADD VALUE 'INVOICE_EDIT_REVERSAL';
ALTER TYPE "LedgerEntryType" ADD VALUE 'INVOICE_EDIT';
