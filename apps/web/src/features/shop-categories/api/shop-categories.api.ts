import {
  type ShopCategory,
  type CreateShopCategoryInput,
  type ListShopCategoriesQueryInput,
  type Paginated,
  type UpdateShopCategoryInput,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const shopCategoriesApi = {
  list: (params: ListShopCategoriesQueryInput) =>
    apiFetch<Paginated<ShopCategory>>(`/shop-categories${toQueryString(params)}`),
  create: (body: CreateShopCategoryInput) =>
    apiFetch<ShopCategory>('/shop-categories', { method: 'POST', json: body }),
  update: (id: string, body: UpdateShopCategoryInput) =>
    apiFetch<ShopCategory>(`/shop-categories/${id}`, { method: 'PATCH', json: body }),
};
