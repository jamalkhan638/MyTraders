import {
  type CreateExpenseInput,
  type Expense,
  type ExpenseList,
  type ListExpensesQueryInput,
  type UpdateExpenseInput,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const expensesApi = {
  list: (params: ListExpensesQueryInput) =>
    apiFetch<ExpenseList>(`/expenses${toQueryString(params)}`),
  create: (body: CreateExpenseInput) =>
    apiFetch<Expense>('/expenses', { method: 'POST', json: body }),
  update: (id: string, body: UpdateExpenseInput) =>
    apiFetch<Expense>(`/expenses/${id}`, { method: 'PATCH', json: body }),
  void: (id: string, reason: string) =>
    apiFetch<Expense>(`/expenses/${id}/void`, { method: 'POST', json: { reason } }),
};
