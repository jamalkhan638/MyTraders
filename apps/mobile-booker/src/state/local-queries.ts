import { useQuery } from '@tanstack/react-query';
import {
  countByStatus,
  getDraftForShop,
  getOrder,
  getShop,
  listAreas,
  listMyOrders,
  listProducts,
  listShops,
} from '../db/repo';
import { useSession } from './app-context';

/** Reads from the phone's SQLite (works offline). Keys start with 'local' — syncs invalidate them. */
export function useShops(filter: { q?: string; areaId?: string }) {
  const { db, owner } = useSession();
  return useQuery({
    queryKey: ['local', owner, 'shops', filter],
    queryFn: () => listShops(db, owner, filter),
  });
}
export function useShop(id: string) {
  const { db, owner } = useSession();
  return useQuery({
    queryKey: ['local', owner, 'shop', id],
    queryFn: () => getShop(db, owner, id),
  });
}
export function useAreas() {
  const { db, owner } = useSession();
  return useQuery({ queryKey: ['local', owner, 'areas'], queryFn: () => listAreas(db, owner) });
}
export function useProducts(q: string) {
  const { db, owner } = useSession();
  return useQuery({
    queryKey: ['local', owner, 'products', q],
    queryFn: () => listProducts(db, owner, q),
  });
}
export function useMyOrders() {
  const { db, owner } = useSession();
  return useQuery({ queryKey: ['local', owner, 'orders'], queryFn: () => listMyOrders(db, owner) });
}
export function useOrder(localId: string) {
  const { db, owner } = useSession();
  return useQuery({
    queryKey: ['local', owner, 'order', localId],
    queryFn: () => getOrder(db, owner, localId),
  });
}
export function useDraft(shopId: string) {
  const { db, owner } = useSession();
  return useQuery({
    queryKey: ['local', owner, 'draft', shopId],
    queryFn: () => getDraftForShop(db, owner, shopId),
    staleTime: Infinity,
  });
}
export function useSyncCounts() {
  const { db, owner } = useSession();
  return useQuery({
    queryKey: ['local', owner, 'counts'],
    queryFn: () => countByStatus(db, owner),
  });
}
