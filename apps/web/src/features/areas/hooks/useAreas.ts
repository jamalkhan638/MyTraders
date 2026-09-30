import {
  type CreateAreaInput,
  type ListAreasQueryInput,
  type UpdateAreaInput,
} from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { areasApi } from '../api/areas.api';

export const areasKeys = {
  all: ['areas'] as const,
  list: (params: ListAreasQueryInput) => ['areas', 'list', params] as const,
};

export function useAreas(params: ListAreasQueryInput) {
  return useQuery({
    queryKey: areasKeys.list(params),
    queryFn: () => areasApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useCreateArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAreaInput) => areasApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasKeys.all }),
  });
}

export function useUpdateArea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateAreaInput }) => areasApi.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: areasKeys.all }),
  });
}
