import { ORDER_MAX_LINES, ORDER_MAX_QUANTITY } from '@mytraders/shared-types';
import { z } from 'zod';
import { type LocalOrderLine, type LocalShop, saveOrder } from '../db/repo';
import { type LocalDb } from '../db/sql';

/** What the booker entered (quantities only — no prices exist in this app, D-24). */
export const bookOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        productName: z.string(),
        productType: z.enum(['TIN', 'POUCH']),
        quantity: z
          .number({ message: 'Enter a quantity' })
          .int('Whole numbers only')
          .min(1, 'Quantity must be at least 1')
          .max(ORDER_MAX_QUANTITY, `At most ${ORDER_MAX_QUANTITY.toLocaleString('en-US')}`),
      }),
    )
    .min(1, 'Add at least one product')
    .max(ORDER_MAX_LINES, `At most ${ORDER_MAX_LINES} products`)
    .refine(
      (lines) => new Set(lines.map((l) => l.productId)).size === lines.length,
      'A product is in the order twice',
    ),
  notes: z.string().trim().max(500, 'Note is too long').optional(),
});
export type BookOrderInput = z.infer<typeof bookOrderSchema>;

/** TIN is ordered in pieces, POUCH in cartons (D-28). */
export const unitLabel = (type: 'TIN' | 'POUCH') => (type === 'TIN' ? 'Qty Pcs' : 'Qty Ctn');
export const unitShort = (type: 'TIN' | 'POUCH') => (type === 'TIN' ? 'pcs' : 'ctn');

/**
 * Local-first booking: the order is written to SQLite as PENDING_SYNC before any network call,
 * with a new UUID that is also its clientOrderId. Correcting a permanently failed order keeps
 * its id (the server never created it), so the corrected order is still sent exactly once.
 */
export async function bookOrder(
  db: LocalDb,
  ctx: { owner: string; orgId: string; now: number; uuid: () => string },
  shop: Pick<LocalShop, 'id' | 'name' | 'areaName'>,
  input: BookOrderInput,
  existingLocalId?: string,
): Promise<string> {
  const parsed = bookOrderSchema.parse(input);
  const localId = existingLocalId ?? ctx.uuid();
  await saveOrder(db, {
    owner: ctx.owner,
    orgId: ctx.orgId,
    localId,
    shop,
    lines: parsed.lines as LocalOrderLine[],
    notes: parsed.notes ? parsed.notes : null,
    status: 'PENDING_SYNC',
    now: ctx.now,
  });
  return localId;
}
