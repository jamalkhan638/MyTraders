import { formatDocumentNumber } from '@mytraders/shared-types';
import { type CounterKey, type Prisma } from '@prisma/client';

/** Minimal transaction surface needed here (works for the plain and the tenant-scoped client). */
type Tx = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Allocates the next order / invoice number of an organization inside the caller's transaction
 * (docs/architecture.md §7).
 *
 * The UPSERT takes a row lock on the organization's counter until the transaction ends, so
 * concurrent documents are serialized and can never receive the same number; if the transaction
 * rolls back, the increment rolls back too, so no number is skipped. The unique
 * (organizationId, number) index on the document is the final safety net.
 */
export async function allocateDocumentNumber(
  tx: Tx,
  organizationId: string,
  key: CounterKey,
): Promise<string> {
  const [counter] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "OrganizationCounter" ("organizationId", "key", "nextValue")
    VALUES (${organizationId}::uuid, ${key}::"CounterKey", 2)
    ON CONFLICT ("organizationId", "key")
    DO UPDATE SET "nextValue" = "OrganizationCounter"."nextValue" + 1
    RETURNING "nextValue" - 1 AS value`;
  return format(tx, organizationId, key, Number(counter.value));
}

/** The number the next document would get — for display only; nothing is reserved. */
export async function peekDocumentNumber(
  tx: Tx,
  organizationId: string,
  key: CounterKey,
): Promise<string> {
  const [counter] = await tx.$queryRaw<{ value: number }[]>`
    SELECT "nextValue" AS value FROM "OrganizationCounter"
    WHERE "organizationId" = ${organizationId}::uuid AND "key" = ${key}::"CounterKey"`;
  return format(tx, organizationId, key, Number(counter?.value ?? 1));
}

async function format(tx: Tx, organizationId: string, key: CounterKey, value: number) {
  const [settings] = await tx.$queryRaw<{ prefix: string; digits: number }[]>`
    SELECT
      CASE WHEN ${key} = 'ORDER' THEN "orderPrefix" ELSE "invoicePrefix" END AS prefix,
      CASE WHEN ${key} = 'ORDER' THEN "orderNumberDigits" ELSE "invoiceNumberDigits" END AS digits
    FROM "Organization" WHERE id = ${organizationId}::uuid`;
  return formatDocumentNumber(settings.prefix, settings.digits, value);
}
