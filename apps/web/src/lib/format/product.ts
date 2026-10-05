import {
  PRODUCT_UNIT_LABELS,
  type ProductUnit,
  QUANTITY_UNIT_LABELS,
  type QuantityUnit,
  type WeightBasis,
} from '@mytraders/shared-types';
import { formatQuantity } from './number';

const BASIS_SHORT: Record<WeightBasis, string> = { PIECE: 'pc', CARTON: 'ctn' };

/** "4.5 KG / pc", "4.5 KG / ctn", or "—" when no weight is set. */
export function weightLabel(product: {
  weight: string | null;
  weightUnit: ProductUnit | null;
  weightBasis: WeightBasis | null;
}): string {
  if (!product.weight) return '—';
  const unit = product.weightUnit ? ` ${PRODUCT_UNIT_LABELS[product.weightUnit]}` : '';
  const basis = product.weightBasis ? ` / ${BASIS_SHORT[product.weightBasis]}` : '';
  return `${formatQuantity(product.weight)}${unit}${basis}`;
}

/** "Qty (Pcs)" for a TIN line, "Qty (Ctn)" for a POUCH line (D-28). */
export function quantityLabel(unit: QuantityUnit): string {
  return `Qty (${QUANTITY_UNIT_LABELS[unit]})`;
}

/** "13 pcs · 5 ctn" — pieces and cartons are shown separately, never added together. */
export function quantityTotals(totals: { totalPieces: number; totalCartons: number }): string {
  const parts = [
    totals.totalPieces > 0 && `${totals.totalPieces} pcs`,
    totals.totalCartons > 0 && `${totals.totalCartons} ctn`,
  ].filter(Boolean);
  return parts.join(' · ') || '0';
}
