import {
  type CreateProductInput,
  type ListProductsQueryInput,
  type UpdateProductInput,
} from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../api/products.api';

export const productsKeys = {
  all: ['products'] as const,
  list: (params: ListProductsQueryInput) => ['products', 'list', params] as const,
};

export function useProducts(params: ListProductsQueryInput) {
  return useQuery({
    queryKey: productsKeys.list(params),
    queryFn: () => productsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductInput) => productsApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productsKeys.all }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProductInput }) =>
      productsApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productsKeys.all }),
  });
}
