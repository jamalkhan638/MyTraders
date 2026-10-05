import { type CreateInvoiceInput, type ListInvoicesQueryInput } from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateBalances } from '@/features/ledger/hooks/useLedger';
import { ordersKeys } from '@/features/orders/hooks/useOrders';
import { invoicesApi } from '../api/invoices.api';

export const invoicesKeys = {
  all: ['invoices'] as const,
  list: (params: ListInvoicesQueryInput) => ['invoices', 'list', params] as const,
  detail: (id: string) => ['invoices', 'detail', id] as const,
  draft: (source: { shopId?: string; orderId?: string }) => ['invoices', 'draft', source] as const,
};

export function useInvoices(params: ListInvoicesQueryInput) {
  return useQuery({
    queryKey: invoicesKeys.list(params),
    queryFn: () => invoicesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoicesKeys.detail(id),
    queryFn: () => invoicesApi.get(id),
    enabled: id !== '',
  });
}

/** Opening state of the invoice form. Never cached: the proposed number and prices must be fresh. */
export function useInvoiceDraft(source: { shopId?: string; orderId?: string }) {
  return useQuery({
    queryKey: invoicesKeys.draft(source),
    queryFn: () => invoicesApi.draft(source),
    enabled: Boolean(source.shopId || source.orderId),
    gcTime: 0,
    staleTime: 0,
    retry: false,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateInvoiceInput) => invoicesApi.create(body),
    onSuccess: async (invoice) => {
      queryClient.setQueryData(invoicesKeys.detail(invoice.id), invoice);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invoicesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ordersKeys.all }),
        // the invoice debit changed the shop's balance (D-30)
        invalidateBalances(queryClient),
      ]);
    },
  });
}

export function useCancelInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => invoicesApi.cancel(id, reason),
    onSuccess: (invoice) => {
      queryClient.setQueryData(invoicesKeys.detail(invoice.id), invoice);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: invoicesKeys.all }),
        // the reversal credit changed the shop's balance
        invalidateBalances(queryClient),
      ]);
    },
  });
}
