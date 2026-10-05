import { PRODUCT_UNIT_LABELS, type ProductUnit, type WeightBasis } from '@mytraders/shared-types';
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
