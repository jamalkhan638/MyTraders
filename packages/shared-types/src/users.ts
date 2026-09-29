import { z } from 'zod';
import {
  emailSchema,
  optionalText,
  paginatedSchema,
  paginationQuerySchema,
  passwordSchema,
  requiredText,
} from './common';
import { UserRole } from './enums';

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: z.enum(UserRole),
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const userListSchema = paginatedSchema(userSchema);

/** GET /users query. */
export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(UserRole).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;
export type ListUsersQueryInput = z.input<typeof listUsersQuerySchema>;

/** POST /users — always creates an ORDER_BOOKER in the caller's organization. */
export const createOrderBookerSchema = z.object({
  name: requiredText(120, 'Name'),
  email: emailSchema,
  phone: optionalText(40),
  password: passwordSchema,
});
export type CreateOrderBookerInput = z.input<typeof createOrderBookerSchema>;

/** PATCH /users/:id — Order Booker accounts only. `password` resets the password. */
export const updateOrderBookerSchema = z.object({
  name: requiredText(120, 'Name').optional(),
  email: emailSchema.optional(),
  phone: optionalText(40),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});
export type UpdateOrderBookerInput = z.input<typeof updateOrderBookerSchema>;
