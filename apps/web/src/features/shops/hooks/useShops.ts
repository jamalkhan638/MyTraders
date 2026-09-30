import {
  type CreateShopInput,
  type ListShopsQueryInput,
  type UpdateShopInput,
} from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shopsApi } from '../api/shops.api';

export const shopsKeys = {
  all: ['shops'] as const,
  list: (params: ListShopsQueryInput) => ['shops', 'list', params] as const,
  detail: (id: string) => ['shops', 'detail', id] as const,
};

export function useShops(params: ListShopsQueryInput) {
  return useQuery({
    queryKey: shopsKeys.list(params),
    queryFn: () => shopsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useShop(id: string) {
  return useQuery({ queryKey: shopsKeys.detail(id), queryFn: () => shopsApi.get(id) });
}

export function useCreateShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShopInput) => shopsApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shopsKeys.all }),
  });
}

export function useUpdateShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateShopInput }) => shopsApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shopsKeys.all }),
  });
}
