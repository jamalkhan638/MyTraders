-- D-46: mobile offline orders carry a client-made UUID; one order per id per organization, so a
-- resent order (weak connection) returns the existing order instead of a duplicate.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "clientOrderId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_clientOrderId_key" ON "Order"("organizationId", "clientOrderId");
