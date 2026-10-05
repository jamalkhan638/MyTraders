-- D-28: an order quantity counts pieces for a TIN and cartons for a POUCH.
CREATE TYPE "QuantityUnit" AS ENUM ('PIECE', 'CARTON');

ALTER TABLE "OrderItem" ADD COLUMN "quantityUnit" "QuantityUnit";

-- Existing lines take the unit of their product's current type.
UPDATE "OrderItem" oi
SET "quantityUnit" = CASE WHEN p."type" = 'POUCH' THEN 'CARTON'::"QuantityUnit" ELSE 'PIECE'::"QuantityUnit" END
FROM "Product" p
WHERE p."id" = oi."productId";

ALTER TABLE "OrderItem" ALTER COLUMN "quantityUnit" SET NOT NULL;
