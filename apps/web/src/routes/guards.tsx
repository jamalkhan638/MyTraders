import { type UserRole } from '@mytraders/shared-types';
import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/features/auth/auth-context';
import { homePathForRole } from '@/lib/permissions/roles';

function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" aria-label="Loading" />
    </div>
  );
}

/** Renders children only for signed-in users; otherwise redirects to /login. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Renders children only for the given roles; other roles go to their own home. UX only. */
export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;
  if (!roles.includes(state.user.role))
    return <Navigate to={homePathForRole(state.user.role)} replace />;
  return <Outlet />;
}

/** /login for signed-in users sends them home. */
export function RedirectIfAuthenticated() {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'authenticated')
    return <Navigate to={homePathForRole(state.user.role)} replace />;
  return <Outlet />;
}

export function RoleHomeRedirect() {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;
  return <Navigate to={homePathForRole(state.user.role)} replace />;
}
