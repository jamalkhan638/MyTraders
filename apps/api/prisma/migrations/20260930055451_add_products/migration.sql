-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('KG', 'GRAM', 'LITER', 'ML');

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "codeNormalized" TEXT,
    "rateCode" TEXT,
    "retailPrice" DECIMAL(14,2) NOT NULL,
    "tradePrice" DECIMAL(14,2) NOT NULL,
    "costPrice" DECIMAL(14,2) NOT NULL,
    "weight" DECIMAL(12,3),
    "unit" "ProductUnit",
    "piecesPerCarton" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_organizationId_name_idx" ON "Product"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_codeNormalized_key" ON "Product"("organizationId", "codeNormalized");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money and quantity sanity checks (the API validates too; the database is the last line of defence).
ALTER TABLE "Product" ADD CONSTRAINT "Product_prices_non_negative_check"
  CHECK ("retailPrice" >= 0 AND "tradePrice" >= 0 AND "costPrice" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_weight_positive_check" CHECK ("weight" IS NULL OR "weight" > 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_pieces_per_carton_positive_check"
  CHECK ("piecesPerCarton" IS NULL OR "piecesPerCarton" >= 1);
