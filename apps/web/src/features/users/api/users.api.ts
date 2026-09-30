import {
  type CreateOrderBookerInput,
  type ListUsersQueryInput,
  type Paginated,
  type UpdateOrderBookerInput,
  type User,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const usersApi = {
  list: (params: ListUsersQueryInput) =>
    apiFetch<Paginated<User>>(`/users${toQueryString(params)}`),
  create: (body: CreateOrderBookerInput) =>
    apiFetch<User>('/users', { method: 'POST', json: body }),
  update: (id: string, body: UpdateOrderBookerInput) =>
    apiFetch<User>(`/users/${id}`, { method: 'PATCH', json: body }),
};
