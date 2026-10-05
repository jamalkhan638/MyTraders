-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('INVOICE', 'PAYMENT', 'MANUAL_ADJUSTMENT', 'INVOICE_REVERSAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentDate" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopLedgerEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "debitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transactionDate" DATE NOT NULL,
    "invoiceId" UUID,
    "paymentId" UUID,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_organizationId_shopId_paymentDate_idx" ON "Payment"("organizationId", "shopId", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_organizationId_paymentDate_idx" ON "Payment"("organizationId", "paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLedgerEntry_paymentId_key" ON "ShopLedgerEntry"("paymentId");

-- CreateIndex
CREATE INDEX "ShopLedgerEntry_organizationId_shopId_transactionDate_creat_idx" ON "ShopLedgerEntry"("organizationId", "shopId", "transactionDate", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ShopLedgerEntry_organizationId_type_transactionDate_idx" ON "ShopLedgerEntry"("organizationId", "type", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShopLedgerEntry_invoiceId_type_key" ON "ShopLedgerEntry"("invoiceId", "type");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Ledger rules (D-30): amounts ≥ 0 and exactly one side > 0; each type has its own side and link.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_amounts_check" CHECK (
  "debitAmount" >= 0 AND "creditAmount" >= 0 AND (("debitAmount" > 0) <> ("creditAmount" > 0))
);
ALTER TABLE "ShopLedgerEntry" ADD CONSTRAINT "ShopLedgerEntry_type_check" CHECK (
  ("type" = 'INVOICE' AND "debitAmount" > 0 AND "invoiceId" IS NOT NULL AND "paymentId" IS NULL)
  OR ("type" = 'INVOICE_REVERSAL' AND "creditAmount" > 0 AND "invoiceId" IS NOT NULL AND "paymentId" IS NULL)
  OR ("type" = 'PAYMENT' AND "creditAmount" > 0 AND "paymentId" IS NOT NULL AND "invoiceId" IS NULL)
  OR ("type" = 'MANUAL_ADJUSTMENT' AND "invoiceId" IS NULL AND "paymentId" IS NULL AND "notes" IS NOT NULL)
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0);

-- Append-only: ledger entries and payments are never changed or deleted (corrections are new entries).
CREATE FUNCTION "ledger_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER "ShopLedgerEntry_append_only"
  BEFORE UPDATE OR DELETE ON "ShopLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "ledger_append_only"();
CREATE TRIGGER "Payment_append_only"
  BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION "ledger_append_only"();

-- ---------------------------------------------------------------------------------------------
-- Invoices confirmed before the ledger existed get their debit (and reversal if cancelled), so
-- every shop balance is explained by ledger entries from day one.
-- ---------------------------------------------------------------------------------------------
INSERT INTO "ShopLedgerEntry"
  ("id", "organizationId", "shopId", "type", "debitAmount", "transactionDate", "invoiceId", "notes", "createdById", "createdAt")
SELECT gen_random_uuid(), i."organizationId", i."shopId", 'INVOICE', i."grandTotal", i."invoiceDate", i."id",
       'Invoice ' || i."invoiceNumber", i."createdById", i."createdAt"
FROM "Invoice" i
WHERE i."grandTotal" > 0;

INSERT INTO "ShopLedgerEntry"
  ("id", "organizationId", "shopId", "type", "creditAmount", "transactionDate", "invoiceId", "notes", "createdById", "createdAt")
SELECT gen_random_uuid(), i."organizationId", i."shopId", 'INVOICE_REVERSAL', i."grandTotal",
       (i."cancelledAt" AT TIME ZONE o."timezone")::date, i."id",
       'Invoice ' || i."invoiceNumber" || ' cancelled: ' || i."cancelReason", i."cancelledById", i."cancelledAt"
FROM "Invoice" i JOIN "Organization" o ON o."id" = i."organizationId"
WHERE i."status" = 'CANCELLED' AND i."grandTotal" > 0;
