import { z } from 'zod';
import {
  emailSchema,
  isValidTimeZone,
  paginatedSchema,
  paginationQuerySchema,
  passwordSchema,
  requiredText,
} from './common';
import { OrganizationStatus } from './enums';
import { documentDigitsSchema, documentPrefixSchema } from './organization';

/**
 * Platform tenant management (Super Admin only, D-38). A tenant is an Organization. These
 * contracts carry tenant identity, status and usage COUNTS only — never shops, invoices, ledger,
 * expenses or any other business record or amount.
 */

const ref = z.object({ id: z.uuid(), name: z.string() });

export const tenantAdminSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type TenantAdmin = z.infer<typeof tenantAdminSchema>;

export const tenantCountsSchema = z.object({
  users: z.number().int(),
  shops: z.number().int(),
  products: z.number().int(),
  invoices: z.number().int(),
});

/** One row of the tenants table. */
export const tenantSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(OrganizationStatus),
  createdAt: z.string(),
  /** the first Admin of the tenant (the one created with it) */
  primaryAdmin: tenantAdminSchema.pick({ id: true, name: true, email: true }).nullable(),
  counts: tenantCountsSchema,
  /** latest sign-in of any user of the tenant */
  lastLoginAt: z.string().nullable(),
});
export type TenantSummary = z.infer<typeof tenantSummarySchema>;

export const tenantListSchema = paginatedSchema(tenantSummarySchema);
export type TenantList = z.infer<typeof tenantListSchema>;

/** GET /platform/tenants — search by name, filter by status. */
export const listTenantsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(OrganizationStatus).optional(),
});
export type ListTenantsQuery = z.output<typeof listTenantsQuerySchema>;
export type ListTenantsQueryInput = z.input<typeof listTenantsQuerySchema>;

/** GET /platform/tenants/:id */
export const tenantDetailsSchema = tenantSummarySchema.extend({
  town: z.string().nullable(),
  phone: z.string().nullable(),
  currency: z.string(),
  timezone: z.string(),
  invoicePrefix: z.string(),
  updatedAt: z.string(),
  statusChangedAt: z.string().nullable(),
  statusChangedBy: ref.nullable(),
  suspensionReason: z.string().nullable(),
  /** the tenant's Admin accounts (Order Bookers are counted, not listed) */
  admins: z.array(tenantAdminSchema),
  counts: tenantCountsSchema.extend({
    admins: z.number().int(),
    orderBookers: z.number().int(),
    activeUsers: z.number().int(),
  }),
});
export type TenantDetails = z.infer<typeof tenantDetailsSchema>;

/** GET /platform/summary — the cards of the platform dashboard. */
export const platformSummarySchema = z.object({
  totalTenants: z.number().int(),
  activeTenants: z.number().int(),
  suspendedTenants: z.number().int(),
  /** legacy status from before D-38; counted separately, can be activated */
  trialTenants: z.number().int(),
});
export type PlatformSummary = z.infer<typeof platformSummarySchema>;

/** POST /platform/tenants — the tenant and its first Admin, created together (ACTIVE). */
export const createTenantSchema = z.object({
  name: requiredText(120, 'Company name'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. PKR')
    .default('PKR'),
  timezone: z.string().trim().refine(isValidTimeZone, 'Unknown timezone').default('Asia/Karachi'),
  invoicePrefix: documentPrefixSchema.optional(),
  invoiceNumberDigits: documentDigitsSchema.optional(),
  admin: z.object({
    name: requiredText(120, 'Admin name'),
    email: emailSchema,
    password: passwordSchema,
  }),
});
export type CreateTenantInput = z.input<typeof createTenantSchema>;
export type CreateTenant = z.output<typeof createTenantSchema>;

/** POST /platform/tenants/:id/suspend */
export const suspendTenantSchema = z.object({
  reason: z
    .string({ message: 'Enter the reason for suspending' })
    .trim()
    .min(3, 'Enter the reason for suspending')
    .max(300, 'Reason must be at most 300 characters'),
});
export type SuspendTenantInput = z.input<typeof suspendTenantSchema>;

/** POST /platform/tenants/:id/admins/:userId/password — sets a new password for a tenant Admin. */
export const resetTenantAdminPasswordSchema = z.object({ password: passwordSchema });
export type ResetTenantAdminPasswordInput = z.input<typeof resetTenantAdminPasswordSchema>;
