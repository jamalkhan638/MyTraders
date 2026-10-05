-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID NOT NULL,
    "updatedById" UUID,
    "voidedAt" TIMESTAMPTZ,
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_organizationId_nameNormalized_key" ON "ExpenseCategory"("organizationId", "nameNormalized");

-- CreateIndex
CREATE INDEX "Expense_organizationId_status_expenseDate_idx" ON "Expense"("organizationId", "status", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_organizationId_categoryId_expenseDate_idx" ON "Expense"("organizationId", "categoryId", "expenseDate");

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- D-32: amounts > 0; a voided expense records who / when / why; expenses are never deleted.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_check" CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_void_check" CHECK (
  ("status" = 'VOIDED') = ("voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND "voidReason" IS NOT NULL)
);

CREATE FUNCTION "expense_never_deleted"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Expenses are never deleted — void them instead' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "Expense_never_deleted"
  BEFORE DELETE ON "Expense"
  FOR EACH ROW EXECUTE FUNCTION "expense_never_deleted"();

-- Default categories for organizations that already exist (new ones get them when created).
INSERT INTO "ExpenseCategory" ("id", "organizationId", "name", "nameNormalized", "updatedAt")
SELECT gen_random_uuid(), o."id", c.name, lower(c.name), now()
FROM "Organization" o
CROSS JOIN (VALUES ('Fuel'), ('Salary'), ('Vehicle Maintenance'), ('Loading / Unloading'), ('Rent'),
                   ('Electricity'), ('Office Expense'), ('Miscellaneous')) AS c(name);
