import {
  type Area,
  type CreateAreaInput,
  type ListAreasQueryInput,
  type Paginated,
  type UpdateAreaInput,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const areasApi = {
  list: (params: ListAreasQueryInput) =>
    apiFetch<Paginated<Area>>(`/areas${toQueryString(params)}`),
  create: (body: CreateAreaInput) => apiFetch<Area>('/areas', { method: 'POST', json: body }),
  update: (id: string, body: UpdateAreaInput) =>
    apiFetch<Area>(`/areas/${id}`, { method: 'PATCH', json: body }),
};
