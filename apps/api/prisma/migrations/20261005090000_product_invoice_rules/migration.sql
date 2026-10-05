-- Product invoice rules (docs D-26). Hand-written so existing data is kept:
-- columns are RENAMED (not dropped/re-created) and new required columns are back-filled.

CREATE TYPE "ProductType" AS ENUM ('TIN', 'POUCH');
CREATE TYPE "WeightBasis" AS ENUM ('PIECE', 'CARTON');

-- costPrice → invoiceCostPrice, unit → weightUnit (values kept; the price CHECK follows the rename).
ALTER TABLE "Product" RENAME COLUMN "costPrice" TO "invoiceCostPrice";
ALTER TABLE "Product" RENAME COLUMN "unit" TO "weightUnit";

-- type: existing products become POUCH when they already have a pieces-per-carton above 1,
-- otherwise TIN. Admins should review existing products after this change.
ALTER TABLE "Product" ADD COLUMN "type" "ProductType";
UPDATE "Product" SET "type" = CASE WHEN "piecesPerCarton" > 1 THEN 'POUCH'::"ProductType" ELSE 'TIN'::"ProductType" END;
ALTER TABLE "Product" ALTER COLUMN "type" SET NOT NULL;

-- weightBasis: existing weights were entered per selling unit; TIN → per piece, POUCH → per carton.
ALTER TABLE "Product" ADD COLUMN "weightBasis" "WeightBasis";
UPDATE "Product" SET "weightBasis" = CASE WHEN "type" = 'POUCH' THEN 'CARTON'::"WeightBasis" ELSE 'PIECE'::"WeightBasis" END
WHERE "weight" IS NOT NULL;
-- A weight without a unit cannot be used; existing ones default to KG for the Admin to review.
UPDATE "Product" SET "weightUnit" = 'KG' WHERE "weight" IS NOT NULL AND "weightUnit" IS NULL;

-- defaultTaxRate: start from the organization's default tax rate (Settings).
ALTER TABLE "Product" ADD COLUMN "defaultTaxRate" DECIMAL(7,4);
UPDATE "Product" p SET "defaultTaxRate" = o."defaultTaxRate" FROM "Organization" o WHERE o.id = p."organizationId";
ALTER TABLE "Product" ALTER COLUMN "defaultTaxRate" SET NOT NULL;

-- Rules the API also validates (the database is the last line of defence).
ALTER TABLE "Product" ADD CONSTRAINT "Product_default_tax_rate_range_check"
  CHECK ("defaultTaxRate" >= 0 AND "defaultTaxRate" <= 100);
ALTER TABLE "Product" ADD CONSTRAINT "Product_pouch_pieces_per_carton_check"
  CHECK ("type" <> 'POUCH' OR "piecesPerCarton" IS NOT NULL);
ALTER TABLE "Product" ADD CONSTRAINT "Product_weight_unit_basis_check"
  CHECK ("weight" IS NULL OR ("weightUnit" IS NOT NULL AND "weightBasis" IS NOT NULL));
