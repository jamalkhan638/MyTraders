import { type BookerProduct } from '@mytraders/shared-types';
import { useCallback, useEffect, useState } from 'react';

export interface DraftLine {
  product: Pick<
    BookerProduct,
    'id' | 'name' | 'code' | 'type' | 'weight' | 'weightUnit' | 'weightBasis'
  >;
  quantity: number;
}

const key = (shopId: string) => `mytraders.orderDraft.${shopId}`;

function load(shopId: string): DraftLine[] {
  try {
    const raw = localStorage.getItem(key(shopId));
    const lines = raw ? (JSON.parse(raw) as DraftLine[]) : [];
    // Drafts saved before products had a type can't show the right unit (Pcs / Ctn): drop them.
    return lines.filter((line) => line.product?.type === 'TIN' || line.product?.type === 'POUCH');
  } catch {
    return [];
  }
}

/**
 * The order being built for one shop. Kept in localStorage so a weak signal or an accidental
 * reload in the market does not lose it (docs/frontend-guidelines.md §6). One line per product.
 */
export function useOrderDraft(shopId: string) {
  const [lines, setLines] = useState<DraftLine[]>(() => load(shopId));

  useEffect(() => {
    try {
      if (lines.length > 0) localStorage.setItem(key(shopId), JSON.stringify(lines));
      else localStorage.removeItem(key(shopId));
    } catch {
      // Storage unavailable (private mode): the draft simply isn't persisted.
    }
  }, [shopId, lines]);

  const add = useCallback((product: DraftLine['product']) => {
    setLines((current) =>
      current.some((line) => line.product.id === product.id)
        ? current
        : [...current, { product, quantity: 1 }],
    );
  }, []);

  /** Sets a quantity; anything below 1 removes the line. */
  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      quantity < 1
        ? current.filter((line) => line.product.id !== productId)
        : current.map((line) => (line.product.id === productId ? { ...line, quantity } : line)),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.product.id !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, add, setQuantity, remove, clear };
}
