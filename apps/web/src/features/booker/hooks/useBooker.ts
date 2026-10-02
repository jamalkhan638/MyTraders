import {
  type ListBookerProductsQueryInput,
  type ListBookerShopsQueryInput,
} from '@mytraders/shared-types';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { bookerApi } from '../api/booker.api';

export const bookerKeys = {
  shops: (params: Omit<ListBookerShopsQueryInput, 'page'>) => ['booker', 'shops', params] as const,
  shop: (id: string) => ['booker', 'shop', id] as const,
  areas: ['booker', 'areas'] as const,
  products: (params: ListBookerProductsQueryInput) => ['booker', 'products', params] as const,
};

export function useMyShops(params: Omit<ListBookerShopsQueryInput, 'page'>) {
  return useInfiniteQuery({
    queryKey: bookerKeys.shops(params),
    queryFn: ({ pageParam }) => bookerApi.shops({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
}

export function useMyShop(id: string) {
  return useQuery({ queryKey: bookerKeys.shop(id), queryFn: () => bookerApi.shop(id) });
}

export function useMyAreas() {
  return useQuery({ queryKey: bookerKeys.areas, queryFn: bookerApi.areas });
}

export function useBookerProducts(params: ListBookerProductsQueryInput) {
  return useQuery({
    queryKey: bookerKeys.products(params),
    queryFn: () => bookerApi.products(params),
    placeholderData: keepPreviousData,
  });
}
