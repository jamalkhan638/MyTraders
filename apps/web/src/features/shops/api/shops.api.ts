import {
  type CreateShopInput,
  type ListShopsQueryInput,
  type Paginated,
  type Shop,
  type UpdateShopInput,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const shopsApi = {
  list: (params: ListShopsQueryInput) =>
    apiFetch<Paginated<Shop>>(`/shops${toQueryString(params)}`),
  get: (id: string) => apiFetch<Shop>(`/shops/${id}`),
  create: (body: CreateShopInput) => apiFetch<Shop>('/shops', { method: 'POST', json: body }),
  update: (id: string, body: UpdateShopInput) =>
    apiFetch<Shop>(`/shops/${id}`, { method: 'PATCH', json: body }),
};
