import {
  type CreateExpenseInput,
  type ListExpensesQueryInput,
  type UpdateExpenseInput,
} from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '../api/expenses.api';

export const expensesKeys = {
  all: ['expenses'] as const,
  list: (params: ListExpensesQueryInput) => ['expenses', 'list', params] as const,
};

export function useExpenses(params: ListExpensesQueryInput) {
  return useQuery({
    queryKey: expensesKeys.list(params),
    queryFn: () => expensesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

function useExpenseMutation<T>(fn: (input: T) => ReturnType<typeof expensesApi.create>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expensesKeys.all }),
  });
}

export const useCreateExpense = () =>
  useExpenseMutation((body: CreateExpenseInput) => expensesApi.create(body));
export const useUpdateExpense = () =>
  useExpenseMutation(({ id, body }: { id: string; body: UpdateExpenseInput }) =>
    expensesApi.update(id, body),
  );
export const useVoidExpense = () =>
  useExpenseMutation(({ id, reason }: { id: string; reason: string }) =>
    expensesApi.void(id, reason),
  );
