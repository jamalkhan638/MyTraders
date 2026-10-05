import { useProducts } from '@/features/products/hooks/useProducts';
import { useShopLookups } from '@/features/shops/hooks/useShopLookups';
import { useShops } from '@/features/shops/hooks/useShops';
import { bookerOptions, type Option } from '../components/filter-options';

const named = (items: { id: string; name: string }[]): Option[] =>
  items.map((i) => ({ value: i.id, label: i.name }));

/** Options for the report filters: areas, shop categories and order bookers of the organization. */
export function useReportLookups(bookerKind: 'sales' | 'shops') {
  const lookups = useShopLookups();
  return {
    areas: named(lookups.areas),
    categories: named(lookups.categories),
    bookers: bookerOptions(lookups.bookers, bookerKind),
  };
}

/** Shops of the chosen area (or the first 100 of all), for the Shop filter. */
export function useShopOptions(areaId?: string): Option[] {
  const shops = useShops({ page: 1, pageSize: 100, areaId });
  return named(shops.data?.items ?? []);
}

export function useProductOptions(): Option[] {
  const products = useProducts({ page: 1, pageSize: 100 });
  return (products.data?.items ?? []).map((p) => ({
    value: p.id,
    label: p.code ? `${p.name} (${p.code})` : p.name,
  }));
}
