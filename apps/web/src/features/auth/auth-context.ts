import { type AuthSessionResponse, type AuthUser } from '@mytraders/shared-types';
import { createContext, useContext } from 'react';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: AuthUser };

export interface AuthContextValue {
  state: AuthState;
  /** Called after a successful login response. */
  signIn: (session: AuthSessionResponse) => void;
  signOut: () => Promise<void>;
  /** Re-reads /auth/me, e.g. after the organization name changed. */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** For pages rendered behind <RequireAuth>, where a user is guaranteed. */
export function useCurrentUser(): AuthUser {
  const { state } = useAuth();
  if (state.status !== 'authenticated')
    throw new Error('useCurrentUser requires an authenticated session');
  return state.user;
}
