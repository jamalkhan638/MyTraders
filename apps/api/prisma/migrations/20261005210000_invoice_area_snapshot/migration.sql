-- D-37: historical area reporting. An invoice keeps the id of the area its shop belonged to when
-- it was confirmed (next to the existing "shopArea" name snapshot), so moving a shop to another
-- area later never moves its old invoices in sales / invoice / product reports.

ALTER TABLE "Invoice" ADD COLUMN "shopAreaId" UUID;

-- Back-fill existing invoices: the organization's area whose name is the invoice's area snapshot;
-- if that area was renamed since, the shop's area. Invoices are append-only, so the guard is
-- disabled for this one-time back-fill only and enabled again right after.
ALTER TABLE "Invoice" DISABLE TRIGGER "Invoice_append_only";

UPDATE "Invoice" i
SET "shopAreaId" = COALESCE(
  (SELECT a."id" FROM "Area" a
   WHERE a."organizationId" = i."organizationId" AND a."name" = i."shopArea"
   ORDER BY a."id" LIMIT 1),
  (SELECT s."areaId" FROM "Shop" s WHERE s."id" = i."shopId")
);

ALTER TABLE "Invoice" ENABLE TRIGGER "Invoice_append_only";

ALTER TABLE "Invoice" ALTER COLUMN "shopAreaId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Invoice_organizationId_shopAreaId_invoiceDate_idx" ON "Invoice"("organizationId", "shopAreaId", "invoiceDate");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shopAreaId_fkey" FOREIGN KEY ("shopAreaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
