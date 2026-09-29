import { type UpdateOrganizationSettings } from '@mytraders/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-context';
import { settingsApi } from '../api/settings.api';

export const settingsKeys = { all: ['organization-settings'] as const };

export function useOrganizationSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: settingsApi.get });
}

export function useUpdateOrganizationSettings() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  return useMutation({
    mutationFn: (body: UpdateOrganizationSettings) => settingsApi.update(body),
    onSuccess: async (settings) => {
      queryClient.setQueryData(settingsKeys.all, settings);
      // Company name / currency / timezone are also part of the signed-in user's session info.
      await refreshUser();
    },
  });
}
