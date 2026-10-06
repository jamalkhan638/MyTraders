import { type CreateTenantInput, type ListTenantsQueryInput } from '@mytraders/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformApi } from '../api/platform.api';

export const platformKeys = {
  all: ['platform'] as const,
  summary: ['platform', 'summary'] as const,
  list: (params: ListTenantsQueryInput) => ['platform', 'tenants', params] as const,
  detail: (id: string) => ['platform', 'tenant', id] as const,
};

export function usePlatformSummary() {
  return useQuery({ queryKey: platformKeys.summary, queryFn: platformApi.summary });
}

export function useTenants(params: ListTenantsQueryInput) {
  return useQuery({
    queryKey: platformKeys.list(params),
    queryFn: () => platformApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useTenant(id: string) {
  return useQuery({ queryKey: platformKeys.detail(id), queryFn: () => platformApi.get(id) });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTenantInput) => platformApi.create(body),
    onSuccess: (tenant) => {
      queryClient.setQueryData(platformKeys.detail(tenant.id), tenant);
      return queryClient.invalidateQueries({ queryKey: platformKeys.all });
    },
  });
}

/** Activate (or reactivate) / suspend a tenant. */
export function useChangeTenantStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: { id: string; action: 'activate' } | { id: string; action: 'suspend'; reason: string },
    ) =>
      input.action === 'activate'
        ? platformApi.activate(input.id)
        : platformApi.suspend(input.id, input.reason),
    onSuccess: (tenant) => {
      queryClient.setQueryData(platformKeys.detail(tenant.id), tenant);
      return queryClient.invalidateQueries({ queryKey: platformKeys.all });
    },
  });
}

export function useResetTenantAdminPassword() {
  return useMutation({
    mutationFn: (input: { tenantId: string; userId: string; password: string }) =>
      platformApi.resetAdminPassword(input.tenantId, input.userId, input.password),
  });
}
