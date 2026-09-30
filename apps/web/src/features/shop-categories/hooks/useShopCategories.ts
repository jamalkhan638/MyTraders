import {
  type CreateShopCategoryInput,
  type ListShopCategoriesQueryInput,
  type UpdateShopCategoryInput,
} from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { shopCategoriesApi } from '../api/shop-categories.api';

export const shopCategoriesKeys = {
  all: ['shop-categories'] as const,
  list: (params: ListShopCategoriesQueryInput) => ['shop-categories', 'list', params] as const,
};

export function useShopCategories(params: ListShopCategoriesQueryInput) {
  return useQuery({
    queryKey: shopCategoriesKeys.list(params),
    queryFn: () => shopCategoriesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateShopCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShopCategoryInput) => shopCategoriesApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shopCategoriesKeys.all }),
  });
}

export function useUpdateShopCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateShopCategoryInput }) =>
      shopCategoriesApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shopCategoriesKeys.all }),
  });
}
