import { formatDocumentNumber } from '@mytraders/shared-types';
import { type Prisma } from '@prisma/client';

/** Minimal transaction surface needed here (works for the plain and the tenant-scoped client). */
type Tx = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Allocates the next order number for an organization inside the caller's transaction
 * (docs/architecture.md §7).
 *
 * The UPSERT takes a row lock on the organization's ORDER counter until the transaction ends, so
 * concurrent orders are serialized and can never receive the same number; if the transaction rolls
 * back, the increment rolls back too, so no number is skipped.
 */
export async function allocateOrderNumber(tx: Tx, organizationId: string): Promise<string> {
  const [counter] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "OrganizationCounter" ("organizationId", "key", "nextValue")
    VALUES (${organizationId}::uuid, 'ORDER'::"CounterKey", 2)
    ON CONFLICT ("organizationId", "key")
    DO UPDATE SET "nextValue" = "OrganizationCounter"."nextValue" + 1
    RETURNING "nextValue" - 1 AS value`;
  const [settings] = await tx.$queryRaw<{ orderPrefix: string; orderNumberDigits: number }[]>`
    SELECT "orderPrefix", "orderNumberDigits" FROM "Organization" WHERE id = ${organizationId}::uuid`;
  return formatDocumentNumber(
    settings.orderPrefix,
    settings.orderNumberDigits,
    Number(counter.value),
  );
}
