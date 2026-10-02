import {
  type BookerArea,
  type BookerProduct,
  type BookerShop,
  type ListBookerProductsQueryInput,
  type ListBookerShopsQueryInput,
  type Paginated,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const bookerApi = {
  shops: (params: ListBookerShopsQueryInput) =>
    apiFetch<Paginated<BookerShop>>(`/booker/shops${toQueryString(params)}`),
  shop: (id: string) => apiFetch<BookerShop>(`/booker/shops/${id}`),
  areas: () => apiFetch<BookerArea[]>('/booker/areas'),
  products: (params: ListBookerProductsQueryInput) =>
    apiFetch<Paginated<BookerProduct>>(`/booker/products${toQueryString(params)}`),
};
