-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TotalWeightUnit" AS ENUM ('KG', 'LITER');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "shopId" UUID NOT NULL,
    "orderId" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'CONFIRMED',
    "shopName" TEXT NOT NULL,
    "shopAddress" TEXT,
    "shopPhone" TEXT,
    "shopContactPerson" TEXT,
    "shopNtn" TEXT,
    "shopStrn" TEXT,
    "shopCnic" TEXT,
    "shopCategory" TEXT,
    "shopArea" TEXT NOT NULL,
    "distributorName" TEXT NOT NULL,
    "distributorAddress" TEXT,
    "distributorTown" TEXT,
    "distributorPhone" TEXT,
    "distributorNtn" TEXT,
    "distributorStrn" TEXT,
    "currency" CHAR(3) NOT NULL,
    "totalValueExclTax" DECIMAL(14,2) NOT NULL,
    "totalGstAmount" DECIMAL(14,2) NOT NULL,
    "totalValueInclGst" DECIMAL(14,2) NOT NULL,
    "totalTradeOffer" DECIMAL(14,2) NOT NULL,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "advanceTax" DECIMAL(14,2),
    "furtherTax" DECIMAL(14,2),
    "adtDiscount" DECIMAL(14,2),
    "duePayment" DECIMAL(14,2),
    "payableValue" DECIMAL(14,2),
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "cancelledAt" TIMESTAMPTZ,
    "cancelledById" UUID,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "productCode" TEXT,
    "productName" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "retailPrice" DECIMAL(14,2) NOT NULL,
    "tradePrice" DECIMAL(14,2) NOT NULL,
    "invoiceCostPrice" DECIMAL(14,2) NOT NULL,
    "piecesPerCarton" INTEGER,
    "weight" DECIMAL(12,3),
    "weightUnit" "ProductUnit",
    "weightBasis" "WeightBasis",
    "qtyCtn" INTEGER,
    "qtyPcs" INTEGER,
    "totalWeight" DECIMAL(14,3) NOT NULL,
    "totalWeightUnit" "TotalWeightUnit",
    "gstRate" DECIMAL(7,4) NOT NULL,
    "valueExclTax" DECIMAL(14,2) NOT NULL,
    "gstAmount" DECIMAL(14,2) NOT NULL,
    "valueInclGst" DECIMAL(14,2) NOT NULL,
    "toRate" DECIMAL(14,4) NOT NULL,
    "toAmount" DECIMAL(14,2) NOT NULL,
    "atoRate" DECIMAL(14,4) NOT NULL,
    "atoAmount" DECIMAL(14,2) NOT NULL,
    "specialDiscount" DECIMAL(14,2) NOT NULL,
    "totalTradeOffer" DECIMAL(14,2) NOT NULL,
    "grossValue" DECIMAL(14,2) NOT NULL,
    "costTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_invoiceDate_idx" ON "Invoice"("organizationId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_shopId_invoiceDate_idx" ON "Invoice"("organizationId", "shopId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_invoiceDate_idx" ON "Invoice"("organizationId", "status", "invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_invoiceNumber_key" ON "Invoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "InvoiceItem_organizationId_productId_idx" ON "InvoiceItem"("organizationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceItem_invoiceId_lineNo_key" ON "InvoiceItem"("invoiceId", "lineNo");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Integrity rules the application also enforces (D-29). Money is never negative; the quantity
-- that prices a row matches the product type; a cancelled invoice records who / when / why.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_check" CHECK (
  "totalValueExclTax" >= 0 AND "totalGstAmount" >= 0 AND "totalValueInclGst" >= 0
  AND "totalTradeOffer" >= 0 AND "grandTotal" >= 0 AND "totalCost" >= 0
  AND COALESCE("advanceTax", 0) >= 0 AND COALESCE("furtherTax", 0) >= 0
  AND COALESCE("adtDiscount", 0) >= 0 AND COALESCE("duePayment", 0) >= 0
  AND COALESCE("payableValue", 0) >= 0
);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cancellation_check" CHECK (
  ("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL AND "cancelReason" IS NOT NULL)
);

ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_quantity_check" CHECK (
  ("productType" = 'TIN' AND "qtyCtn" IS NULL AND "qtyPcs" >= 1)
  OR ("productType" = 'POUCH' AND "qtyCtn" >= 1 AND COALESCE("qtyPcs", 0) >= 0)
);
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_amounts_check" CHECK (
  "retailPrice" >= 0 AND "tradePrice" >= 0 AND "invoiceCostPrice" >= 0
  AND "gstRate" >= 0 AND "gstRate" <= 100 AND "toRate" >= 0 AND "atoRate" >= 0
  AND "totalWeight" >= 0 AND "valueExclTax" >= 0 AND "gstAmount" >= 0 AND "valueInclGst" >= 0
  AND "toAmount" >= 0 AND "atoAmount" >= 0 AND "specialDiscount" >= 0
  AND "totalTradeOffer" >= 0 AND "grossValue" >= 0 AND "costTotal" >= 0
);

-- ---------------------------------------------------------------------------------------------
-- Append-only: invoice rows are never deleted, items never change, and the only change an invoice
-- accepts is CONFIRMED → CANCELLED (with its cancellation fields).
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION "invoice_item_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Invoice items are append-only' USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER "InvoiceItem_append_only"
  BEFORE UPDATE OR DELETE ON "InvoiceItem"
  FOR EACH ROW EXECUTE FUNCTION "invoice_item_immutable"();

CREATE FUNCTION "invoice_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoices are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."status" <> 'CONFIRMED' OR NEW."status" <> 'CANCELLED'
     OR (to_jsonb(NEW) - ARRAY['status','cancelledAt','cancelledById','cancelReason','updatedAt'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['status','cancelledAt','cancelledById','cancelReason','updatedAt']) THEN
    RAISE EXCEPTION 'A confirmed invoice can only be cancelled' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Invoice_append_only"
  BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION "invoice_append_only"();
