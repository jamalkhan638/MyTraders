import {
  type CreateTenantInput,
  type ListTenantsQueryInput,
  type PlatformSummary,
  type TenantDetails,
  type TenantList,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';
import { toQueryString } from '@/lib/api/query-string';

/** Platform tenant management (Super Admin only) — dedicated /platform routes, D-38. */
export const platformApi = {
  summary: () => apiFetch<PlatformSummary>('/platform/summary'),
  list: (params: ListTenantsQueryInput) =>
    apiFetch<TenantList>(`/platform/tenants${toQueryString(params)}`),
  get: (id: string) => apiFetch<TenantDetails>(`/platform/tenants/${id}`),
  create: (body: CreateTenantInput) =>
    apiFetch<TenantDetails>('/platform/tenants', { method: 'POST', json: body }),
  activate: (id: string) =>
    apiFetch<TenantDetails>(`/platform/tenants/${id}/activate`, { method: 'POST' }),
  suspend: (id: string, reason: string) =>
    apiFetch<TenantDetails>(`/platform/tenants/${id}/suspend`, {
      method: 'POST',
      json: { reason },
    }),
  resetAdminPassword: (id: string, userId: string, password: string) =>
    apiFetch<void>(`/platform/tenants/${id}/admins/${userId}/password`, {
      method: 'POST',
      json: { password },
    }),
};
