import {
  type CreateInvoiceInput,
  type EditInvoiceInput,
  type InvoiceDetails,
  type InvoiceDraft,
  type InvoiceSummary,
  type ListInvoicesQueryInput,
  type Paginated,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export const invoicesApi = {
  list: (params: ListInvoicesQueryInput) =>
    apiFetch<Paginated<InvoiceSummary>>(`/invoices${toQueryString(params)}`),
  get: (id: string) => apiFetch<InvoiceDetails>(`/invoices/${id}`),
  draft: (source: { shopId?: string; orderId?: string }) =>
    apiFetch<InvoiceDraft>(`/invoices/draft${toQueryString(source)}`),
  create: (body: CreateInvoiceInput) =>
    apiFetch<InvoiceDetails>('/invoices', { method: 'POST', json: body }),
  batch: (ids: string[]) => apiFetch<InvoiceDetails[]>(`/invoices/batch?ids=${ids.join(',')}`),
  editDraft: (id: string) => apiFetch<InvoiceDraft>(`/invoices/${id}/edit-draft`),
  edit: (id: string, body: EditInvoiceInput) =>
    apiFetch<InvoiceDetails>(`/invoices/${id}`, { method: 'PUT', json: body }),
  cancel: (id: string, reason: string) =>
    apiFetch<InvoiceDetails>(`/invoices/${id}/cancel`, { method: 'POST', json: { reason } }),
};
