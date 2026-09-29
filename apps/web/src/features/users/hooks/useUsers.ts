import {
  type CreateOrderBookerInput,
  type ListUsersQueryInput,
  type UpdateOrderBookerInput,
} from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users.api';

export const usersKeys = {
  all: ['users'] as const,
  list: (params: ListUsersQueryInput) => ['users', 'list', params] as const,
};

export function useUsers(params: ListUsersQueryInput) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateOrderBooker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrderBookerInput) => usersApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useUpdateOrderBooker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateOrderBookerInput }) =>
      usersApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
}
