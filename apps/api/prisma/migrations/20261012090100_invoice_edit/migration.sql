-- D-41: editing a confirmed invoice, safely.
--   * the invoice keeps its id, number, shop, order, creation date / user and header snapshots;
--     only its values and lines change, inside an edit transaction that sets
--     `mytraders.invoice_edit = on` (SET LOCAL) — every other change is still refused;
--   * every edit is an append-only InvoiceRevision (who, when, why, before / after);
--   * the ledger stays append-only: an edit adds INVOICE_EDIT_REVERSAL (old Payable Value) and
--     INVOICE_EDIT (new Payable Value) entries linked to the revision.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "editCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastEditedAt" TIMESTAMPTZ,
ADD COLUMN "lastEditedById" UUID;

-- AlterTable
ALTER TABLE "ShopLedgerEntry" ADD COLUMN "invoiceRevisionId" UUID;

-- CreateTable
CREATE TABLE "InvoiceRevision" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "revisionNo" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "previousPayableValue" DECIMAL(14,2) NOT NULL,
    "newPayableValue" DECIMAL(14,2) NOT NULL,
    "previous" JSONB NOT NULL,
    "current" JSONB NOT NULL,
    "editedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceRevision_organizationId_createdAt_idx" ON "InvoiceRevision"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceRevision_invoiceId_revisionNo_key" ON "InvoiceRevision"("invoiceId", "revisionNo");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLedgerEntry_invoiceRevisionId_type_key" ON "ShopLedgerEntry"("invoiceRevisionId", "type");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRevision" ADD CONSTRAINT "InvoiceRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRevision" ADD CONSTRAINT "InvoiceRevision_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceRevision" ADD CONSTRAINT "InvoiceRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_invoiceRevisionId_fkey" FOREIGN KEY ("invoiceRevisionId") REFERENCES "InvoiceRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InvoiceRevision" ADD CONSTRAINT "InvoiceRevision_values_check" CHECK (
  "revisionNo" >= 1 AND "previousPayableValue" >= 0 AND "newPayableValue" >= 0 AND length(trim("reason")) >= 3
);

-- Ledger: each type keeps its own side and link; the edit types link to a revision only.
ALTER TABLE "ShopLedgerEntry" DROP CONSTRAINT "ShopLedgerEntry_type_check";
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_type_check" CHECK (
  ("type" = 'INVOICE' AND "debitAmount" > 0 AND "invoiceId" IS NOT NULL AND "paymentId" IS NULL AND "invoiceRevisionId" IS NULL)
  OR ("type" = 'INVOICE_REVERSAL' AND "creditAmount" > 0 AND "invoiceId" IS NOT NULL AND "paymentId" IS NULL AND "invoiceRevisionId" IS NULL)
  OR ("type" = 'PAYMENT' AND "creditAmount" > 0 AND "paymentId" IS NOT NULL AND "invoiceId" IS NULL AND "invoiceRevisionId" IS NULL)
  OR ("type" = 'MANUAL_ADJUSTMENT' AND "invoiceId" IS NULL AND "paymentId" IS NULL AND "invoiceRevisionId" IS NULL AND "notes" IS NOT NULL)
  OR ("type" = 'INVOICE_EDIT_REVERSAL' AND "creditAmount" > 0 AND "invoiceRevisionId" IS NOT NULL AND "invoiceId" IS NULL AND "paymentId" IS NULL)
  OR ("type" = 'INVOICE_EDIT' AND "debitAmount" > 0 AND "invoiceRevisionId" IS NOT NULL AND "invoiceId" IS NULL AND "paymentId" IS NULL)
);

-- Revisions are append-only, like the ledger.
CREATE TRIGGER "InvoiceRevision_append_only"
  BEFORE UPDATE OR DELETE ON "InvoiceRevision"
  FOR EACH ROW EXECUTE FUNCTION "ledger_append_only"();

-- A confirmed invoice can be cancelled, or — only inside an edit transaction — have its values
-- changed while its identity (number, shop, order, creation, header snapshots) stays the same.
CREATE OR REPLACE FUNCTION "invoice_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  editable text[] := ARRAY['invoiceDate','totalValueExclTax','totalGstAmount','totalValueInclGst',
    'totalTradeOffer','grandTotal','totalCost','advanceTax','furtherTax','adtDiscount','duePayment',
    'payableValue','notes','editCount','lastEditedAt','lastEditedById','updatedAt'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoices are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF current_setting('mytraders.invoice_edit', true) = 'on'
     AND OLD."status" = 'CONFIRMED' AND NEW."status" = 'CONFIRMED'
     AND (to_jsonb(NEW) - editable) IS NOT DISTINCT FROM (to_jsonb(OLD) - editable) THEN
    RETURN NEW;
  END IF;
  IF OLD."status" <> 'CONFIRMED' OR NEW."status" <> 'CANCELLED'
     OR (to_jsonb(NEW) - ARRAY['status','cancelledAt','cancelledById','cancelReason','updatedAt'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['status','cancelledAt','cancelledById','cancelReason','updatedAt']) THEN
    RAISE EXCEPTION 'A confirmed invoice can only be cancelled' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Lines of a CONFIRMED invoice may be replaced (deleted, then inserted) only inside an edit
-- transaction; the previous lines are kept in the revision. Never updated in place.
CREATE OR REPLACE FUNCTION "invoice_item_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('mytraders.invoice_edit', true) = 'on'
     AND EXISTS (SELECT 1 FROM "Invoice" WHERE "id" = OLD."invoiceId" AND "status" = 'CONFIRMED') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Invoice items are append-only' USING ERRCODE = 'check_violation';
END $$;
