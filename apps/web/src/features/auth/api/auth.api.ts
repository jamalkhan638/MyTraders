import {
  type AuthSessionResponse,
  type AuthUser,
  type LoginRequest,
} from '@mytraders/shared-types';
import { apiFetch } from '@/lib/api/client';

export const authApi = {
  login: (body: LoginRequest) =>
    apiFetch<AuthSessionResponse>('/auth/login', { method: 'POST', json: body }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
  me: () => apiFetch<AuthUser>('/auth/me'),
};
