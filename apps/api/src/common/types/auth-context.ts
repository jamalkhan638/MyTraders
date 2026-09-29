import { type UserRole } from '@mytraders/shared-types';

/** Who is making the request. Built by JwtAuthGuard from the database, never from client input. */
export interface AuthContext {
  userId: string;
  /** null only for SUPER_ADMIN */
  organizationId: string | null;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
