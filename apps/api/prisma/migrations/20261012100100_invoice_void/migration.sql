-- D-42: "Delete invoice" is a void, never a physical delete. The invoice, its lines and snapshots
-- stay; status becomes VOIDED with who / when / why; the ledger gets an INVOICE_VOID_REVERSAL
-- credit of the invoice's current Payable Value (the original debit is never touched).

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "voidReason" TEXT,
ADD COLUMN "voidedAt" TIMESTAMPTZ,
ADD COLUMN "voidedById" UUID;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_void_check" CHECK (
  ("status" = 'VOIDED') = ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidReason" IS NOT NULL)
);

ALTER TABLE "ShopLedgerEntry" DROP CONSTRAINT "ShopLedgerEntry_type_check";
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_type_check" CHECK (
  ("type" = 'INVOICE' AND "debitAmount" > 0 AND "invoiceId" IS NOT NULL AND "paymentId" IS NULL AND "invoiceRevisionId" IS NULL)
  OR ("type" = 'INVOICE_REVERSAL' AND "creditAmount" > 0 AND "invoiceId" IS NOT NULL AND "paymentId" IS NULL AND "invoiceRevisionId" IS NULL)
  OR ("type" = 'INVOICE_VOID_REVERSAL' AND "creditAmount" > 0 AND "invoiceId" IS NOT NULL AND "paymentId" IS NULL AND "invoiceRevisionId" IS NULL)
  OR ("type" = 'PAYMENT' AND "creditAmount" > 0 AND "paymentId" IS NOT NULL AND "invoiceId" IS NULL AND "invoiceRevisionId" IS NULL)
  OR ("type" = 'MANUAL_ADJUSTMENT' AND "invoiceId" IS NULL AND "paymentId" IS NULL AND "invoiceRevisionId" IS NULL AND "notes" IS NOT NULL)
  OR ("type" = 'INVOICE_EDIT_REVERSAL' AND "creditAmount" > 0 AND "invoiceRevisionId" IS NOT NULL AND "invoiceId" IS NULL AND "paymentId" IS NULL)
  OR ("type" = 'INVOICE_EDIT' AND "debitAmount" > 0 AND "invoiceRevisionId" IS NOT NULL AND "invoiceId" IS NULL AND "paymentId" IS NULL)
);

-- At most one reversal of either kind per invoice (cancelled and voided are both final).
CREATE UNIQUE INDEX "ShopLedgerEntry_one_invoice_reversal" ON "ShopLedgerEntry"("invoiceId")
  WHERE "type" IN ('INVOICE_REVERSAL', 'INVOICE_VOID_REVERSAL');

-- A confirmed invoice can be edited (values / lines, inside the edit transaction), cancelled, or
-- voided — each changing only its own columns. Nothing else, and never a delete.
CREATE OR REPLACE FUNCTION "invoice_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  editable text[] := ARRAY['invoiceDate','totalValueExclTax','totalGstAmount','totalValueInclGst',
    'totalTradeOffer','grandTotal','totalCost','advanceTax','furtherTax','adtDiscount','duePayment',
    'payableValue','notes','editCount','lastEditedAt','lastEditedById','updatedAt'];
  cancelling text[] := ARRAY['status','cancelledAt','cancelledById','cancelReason','updatedAt'];
  voiding text[] := ARRAY['status','voidedAt','voidedById','voidReason','updatedAt'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoices are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" = 'CONFIRMED' THEN
    IF current_setting('mytraders.invoice_edit', true) = 'on' AND NEW."status" = 'CONFIRMED'
       AND (to_jsonb(NEW) - editable) IS NOT DISTINCT FROM (to_jsonb(OLD) - editable) THEN
      RETURN NEW;
    END IF;
    IF NEW."status" = 'CANCELLED'
       AND (to_jsonb(NEW) - cancelling) IS NOT DISTINCT FROM (to_jsonb(OLD) - cancelling) THEN
      RETURN NEW;
    END IF;
    IF NEW."status" = 'VOIDED'
       AND (to_jsonb(NEW) - voiding) IS NOT DISTINCT FROM (to_jsonb(OLD) - voiding) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'A confirmed invoice can only be cancelled, voided or edited through the edit workflow'
    USING ERRCODE = 'check_violation';
END $$;
