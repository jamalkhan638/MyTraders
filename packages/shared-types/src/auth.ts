import { z } from 'zod';
import { OrganizationStatus, UserRole } from './enums';

export const loginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: 'Enter a valid email address' })),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authOrganizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(OrganizationStatus),
  currency: z.string(),
  timezone: z.string(),
});
export type AuthOrganization = z.infer<typeof authOrganizationSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(UserRole),
  organization: authOrganizationSchema.nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionResponseSchema = z.object({
  accessToken: z.string(),
  /** Access token lifetime in seconds. */
  expiresIn: z.number().int(),
  user: authUserSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

// ---- mobile (Order Booker app, D-46) -----------------------------------------------------------

/**
 * POST /auth/mobile/login and /auth/mobile/refresh response. A phone cannot use the web's
 * httpOnly cookie, so the refresh token is returned in the body; the app keeps it in the
 * device's secure storage. Only ORDER_BOOKER users get one.
 */
export const mobileSessionResponseSchema = authSessionResponseSchema.extend({
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
});
export type MobileSessionResponse = z.infer<typeof mobileSessionResponseSchema>;

/** POST /auth/mobile/refresh and /auth/mobile/logout body. */
export const mobileRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Missing refresh token').max(200),
});
export type MobileRefreshRequest = z.infer<typeof mobileRefreshRequestSchema>;
