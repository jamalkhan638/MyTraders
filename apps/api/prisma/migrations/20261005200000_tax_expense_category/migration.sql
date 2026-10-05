-- D-33: tax actually paid by the distributor is recorded as an expense; give existing organizations
-- the "Tax / Government Tax" category (new organizations get it with the other defaults).
INSERT INTO "ExpenseCategory" ("id", "organizationId", "name", "nameNormalized", "updatedAt")
SELECT gen_random_uuid(), o."id", 'Tax / Government Tax', 'tax / government tax', now()
FROM "Organization" o
ON CONFLICT ("organizationId", "nameNormalized") DO NOTHING;
