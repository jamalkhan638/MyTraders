import {
  type CreateExpenseCategoryInput,
  type ListExpenseCategoriesQueryInput,
  type UpdateExpenseCategoryInput,
} from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expenseCategoriesApi } from '../api/expense-categories.api';

export const expenseCategoriesKeys = {
  all: ['expense-categories'] as const,
  list: (params: ListExpenseCategoriesQueryInput) =>
    ['expense-categories', 'list', params] as const,
};

export function useExpenseCategories(params: ListExpenseCategoriesQueryInput) {
  return useQuery({
    queryKey: expenseCategoriesKeys.list(params),
    queryFn: () => expenseCategoriesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExpenseCategoryInput) => expenseCategoriesApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseCategoriesKeys.all }),
  });
}

export function useUpdateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateExpenseCategoryInput }) =>
      expenseCategoriesApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expenseCategoriesKeys.all }),
  });
}
