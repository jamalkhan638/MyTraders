-- D-38: platform tenant management. Who last activated / suspended a tenant, when, and why it is
-- suspended. Additive only; no billing / subscription tables.
ALTER TABLE "Organization" ADD COLUMN "statusChangedAt" TIMESTAMPTZ,
ADD COLUMN "statusChangedById" UUID,
ADD COLUMN "suspensionReason" TEXT;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_statusChangedById_fkey" FOREIGN KEY ("statusChangedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
