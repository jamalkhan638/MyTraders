import { useAreas } from '@/features/areas/hooks/useAreas';
import { useShopCategories } from '@/features/shop-categories/hooks/useShopCategories';
import { useUsers } from '@/features/users/hooks/useUsers';

/** Largest page the list endpoints allow; enough for the dropdowns of one distributor. */
const ALL = { page: 1, pageSize: 100 } as const;

/** Areas, shop categories and order bookers of the organization, for filters and the shop form. */
export function useShopLookups() {
  const areas = useAreas(ALL);
  const categories = useShopCategories(ALL);
  const bookers = useUsers({ ...ALL, role: 'ORDER_BOOKER' });
  return {
    areas: areas.data?.items ?? [],
    categories: categories.data?.items ?? [],
    bookers: bookers.data?.items ?? [],
    isLoading: areas.isPending || categories.isPending || bookers.isPending,
  };
}
