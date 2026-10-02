import {
  type CreateOrderInput,
  type ListOrdersQueryInput,
  type OrderDetails,
  type OrderSummary,
  type Paginated,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const ordersApi = {
  list: (params: ListOrdersQueryInput) =>
    apiFetch<Paginated<OrderSummary>>(`/orders${toQueryString(params)}`),
  get: (id: string) => apiFetch<OrderDetails>(`/orders/${id}`),
  create: (body: CreateOrderInput) =>
    apiFetch<OrderDetails>('/orders', { method: 'POST', json: body }),
  cancel: (id: string) => apiFetch<OrderDetails>(`/orders/${id}/cancel`, { method: 'POST' }),
};
