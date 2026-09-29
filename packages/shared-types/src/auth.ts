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
