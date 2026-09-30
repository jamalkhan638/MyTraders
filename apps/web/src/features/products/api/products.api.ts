import {
  type CreateProductInput,
  type ListProductsQueryInput,
  type Paginated,
  type Product,
  type UpdateProductInput,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const productsApi = {
  list: (params: ListProductsQueryInput) =>
    apiFetch<Paginated<Product>>(`/products${toQueryString(params)}`),
  create: (body: CreateProductInput) =>
    apiFetch<Product>('/products', { method: 'POST', json: body }),
  update: (id: string, body: UpdateProductInput) =>
    apiFetch<Product>(`/products/${id}`, { method: 'PATCH', json: body }),
};
