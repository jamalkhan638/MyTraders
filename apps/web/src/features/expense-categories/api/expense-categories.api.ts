import {
  type ExpenseCategory,
  type CreateExpenseCategoryInput,
  type ListExpenseCategoriesQueryInput,
  type Paginated,
  type UpdateExpenseCategoryInput,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const expenseCategoriesApi = {
  list: (params: ListExpenseCategoriesQueryInput) =>
    apiFetch<Paginated<ExpenseCategory>>(`/expense-categories${toQueryString(params)}`),
  create: (body: CreateExpenseCategoryInput) =>
    apiFetch<ExpenseCategory>('/expense-categories', { method: 'POST', json: body }),
  update: (id: string, body: UpdateExpenseCategoryInput) =>
    apiFetch<ExpenseCategory>(`/expense-categories/${id}`, { method: 'PATCH', json: body }),
};
