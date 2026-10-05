import { type DashboardSummary } from '@mytraders/shared-types';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

/** Every dashboard card in one request; refreshed every minute while the page is open. */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => apiFetch<DashboardSummary>('/dashboard/summary'),
    refetchInterval: 60_000,
  });
}
