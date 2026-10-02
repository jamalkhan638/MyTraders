import { type CreateOrderInput, type ListOrdersQueryInput } from '@mytraders/shared-types';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ordersApi } from '../api/orders.api';

export const ordersKeys = {
  all: ['orders'] as const,
  list: (params: ListOrdersQueryInput) => ['orders', 'list', params] as const,
  infinite: (params: Omit<ListOrdersQueryInput, 'page'>) => ['orders', 'infinite', params] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};

/** Admin list. `pollMs` keeps pending orders fresh (docs §4.8: ~20 s). */
export function useOrders(params: ListOrdersQueryInput, pollMs?: number) {
  return useQuery({
    queryKey: ordersKeys.list(params),
    queryFn: () => ordersApi.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: pollMs,
  });
}

/** Booker list with "Load more". */
export function useInfiniteOrders(params: Omit<ListOrdersQueryInput, 'page'>) {
  return useInfiniteQuery({
    queryKey: ordersKeys.infinite(params),
    queryFn: ({ pageParam }) => ordersApi.list({ ...params, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ordersKeys.detail(id),
    queryFn: () => ordersApi.get(id),
    enabled: id !== '',
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrderInput) => ordersApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ordersKeys.all }),
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ordersApi.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ordersKeys.all }),
  });
}
