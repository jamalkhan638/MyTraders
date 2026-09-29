import {
  type OrganizationSettings,
  type UpdateOrganizationSettings,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';

export const settingsApi = {
  get: () => apiFetch<OrganizationSettings>('/organization/settings'),
  update: (body: UpdateOrganizationSettings) =>
    apiFetch<OrganizationSettings>('/organization/settings', { method: 'PATCH', json: body }),
};
