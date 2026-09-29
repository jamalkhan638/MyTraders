import { type UserRole } from '@mytraders/shared-types';

/** Where each role lands after login. UX only — the api enforces permissions. */
export function homePathForRole(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return '/dashboard';
    case 'ORDER_BOOKER':
      return '/booker';
    case 'SUPER_ADMIN':
      return '/platform';
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  ORDER_BOOKER: 'Order Booker',
};
