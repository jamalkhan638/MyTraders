-- CreateTable
CREATE TABLE "Shop" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "ntn" TEXT,
    "strn" TEXT,
    "cnic" TEXT,
    "areaId" UUID NOT NULL,
    "categoryId" UUID,
    "assignedOrderBookerId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shop_organizationId_name_idx" ON "Shop"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Shop_organizationId_areaId_idx" ON "Shop"("organizationId", "areaId");

-- CreateIndex
CREATE INDEX "Shop_organizationId_categoryId_idx" ON "Shop"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "Shop_organizationId_assignedOrderBookerId_idx" ON "Shop"("organizationId", "assignedOrderBookerId");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShopCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_assignedOrderBookerId_fkey" FOREIGN KEY ("assignedOrderBookerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
