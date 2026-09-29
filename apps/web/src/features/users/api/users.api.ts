import {
  type CreateOrderBookerInput,
  type ListUsersQueryInput,
  type Paginated,
  type UpdateOrderBookerInput,
  type User,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';

function toQueryString(params: ListUsersQueryInput): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const usersApi = {
  list: (params: ListUsersQueryInput) =>
    apiFetch<Paginated<User>>(`/users${toQueryString(params)}`),
  create: (body: CreateOrderBookerInput) =>
    apiFetch<User>('/users', { method: 'POST', json: body }),
  update: (id: string, body: UpdateOrderBookerInput) =>
    apiFetch<User>(`/users/${id}`, { method: 'PATCH', json: body }),
};
