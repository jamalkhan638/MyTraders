import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

export type ReportName =
  'sales' | 'invoices' | 'shop-credit' | 'product-sales' | 'expenses' | 'profit' | 'shops';

/** One report from GET /reports/:name — every figure is computed by the server. */
export function useReport<T>(name: ReportName, params: object) {
  return useQuery({
    queryKey: ['reports', name, params],
    queryFn: () => apiFetch<T>(`/reports/${name}${toQueryString(params)}`),
    placeholderData: keepPreviousData,
  });
}
