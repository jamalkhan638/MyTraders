-- D-31: Payable Value is calculated, never entered:
--   Payable Value = Grand Total + Advance Tax + Further Tax − ADT / invoice-level Special Discount
-- and it is the amount debited to the shop ledger (not Grand Total alone).
--
-- One-time correction of rows written before this rule (pre-production data only). Invoices and
-- ledger entries are append-only, so the guards are disabled for this migration only and enabled
-- again below; after this, the triggers apply as before.
ALTER TABLE "Invoice" DISABLE TRIGGER "Invoice_append_only";
ALTER TABLE "ShopLedgerEntry" DISABLE TRIGGER "ShopLedgerEntry_append_only";

UPDATE "Invoice"
SET "payableValue" = "grandTotal" + COALESCE("advanceTax", 0) + COALESCE("furtherTax", 0) - COALESCE("adtDiscount", 0);

UPDATE "ShopLedgerEntry" e
SET "debitAmount" = i."payableValue"
FROM "Invoice" i
WHERE e."invoiceId" = i."id" AND e."type" = 'INVOICE' AND e."debitAmount" <> i."payableValue";

UPDATE "ShopLedgerEntry" e
SET "creditAmount" = i."payableValue"
FROM "Invoice" i
WHERE e."invoiceId" = i."id" AND e."type" = 'INVOICE_REVERSAL' AND e."creditAmount" <> i."payableValue";

ALTER TABLE "Invoice" ENABLE TRIGGER "Invoice_append_only";
ALTER TABLE "ShopLedgerEntry" ENABLE TRIGGER "ShopLedgerEntry_append_only";

ALTER TABLE "Invoice" ALTER COLUMN "payableValue" SET NOT NULL;
-- payableValue ≥ 0 is already part of "Invoice_amounts_check".
