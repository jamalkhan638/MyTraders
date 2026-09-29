import { type AuthSessionResponse } from '@mytraders/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { onSessionChange, refreshSession } from '@/lib/api/client';
import { tokenStore } from '@/lib/auth/token-store';
import { authApi } from './api/auth.api';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    const unsubscribe = onSessionChange((session) => {
      setState(
        session
          ? { status: 'authenticated', user: session.user }
          : { status: 'anonymous', user: null },
      );
    });
    // Restore the session after a page load using the httpOnly refresh cookie.
    void refreshSession();
    return () => {
      unsubscribe();
    };
  }, []);

  const signIn = useCallback((session: AuthSessionResponse) => {
    tokenStore.set(session.accessToken);
    setState({ status: 'authenticated', user: session.user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      tokenStore.clear();
      queryClient.clear();
      setState({ status: 'anonymous', user: null });
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, signOut }),
    [state, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
