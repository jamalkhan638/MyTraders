-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'INVOICED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "shopId" UUID NOT NULL,
    "orderBookerId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "cancelledAt" TIMESTAMPTZ,
    "cancelledById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_organizationId_status_createdAt_idx" ON "Order"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_organizationId_orderBookerId_createdAt_idx" ON "Order"("organizationId", "orderBookerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_organizationId_shopId_idx" ON "Order"("organizationId", "shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_orderNumber_key" ON "Order"("organizationId", "orderNumber");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key" ON "OrderItem"("orderId", "productId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orderBookerId_fkey" FOREIGN KEY ("orderBookerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Order lines: whole positive quantities only (the API validates too).
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_quantity_positive_check" CHECK ("quantity" > 0);
-- A cancelled order records who/when; other statuses never do.
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelled_consistency_check"
  CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL));
