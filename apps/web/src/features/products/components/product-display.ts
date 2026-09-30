import { PRODUCT_UNIT_LABELS, type Product } from '@mytraders/shared-types';
import { formatQuantity } from '@/lib/format/number';

/** "4.5 KG", "500 Gram", or "—". */
export function weightWithUnit(product: Pick<Product, 'weight' | 'unit'>): string {
  if (!product.weight) return product.unit ? PRODUCT_UNIT_LABELS[product.unit] : '—';
  return `${formatQuantity(product.weight)}${product.unit ? ` ${PRODUCT_UNIT_LABELS[product.unit]}` : ''}`;
}
