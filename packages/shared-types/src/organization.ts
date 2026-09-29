import { z } from 'zod';
import { isValidTimeZone, optionalText, requiredText } from './common';
import { OrganizationStatus } from './enums';

/** Organization settings as returned by GET /organization/settings. */
export const organizationSettingsSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(OrganizationStatus),
  address: z.string().nullable(),
  town: z.string().nullable(),
  phone: z.string().nullable(),
  ntn: z.string().nullable(),
  strn: z.string().nullable(),
  logoUrl: z.string().nullable(),
  currency: z.string(),
  timezone: z.string(),
  invoicePrefix: z.string(),
  invoiceNumberDigits: z.number().int(),
  orderPrefix: z.string(),
  orderNumberDigits: z.number().int(),
  /** Percent, decimal string (e.g. "18" or "17.5"). */
  defaultTaxRate: z.string(),
  /** Number the next confirmed invoice will get. */
  nextInvoiceNumber: z.number().int(),
  nextOrderNumber: z.number().int(),
  updatedAt: z.string(),
});
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;

const prefix = z
  .string()
  .trim()
  .max(10, 'Prefix must be at most 10 characters')
  .regex(/^[A-Za-z0-9\-/_.]*$/, 'Use only letters, numbers and - / _ .');

const numberDigits = z.coerce
  .number({ message: 'Enter a number' })
  .int('Enter a whole number')
  .min(3, 'At least 3 digits')
  .max(12, 'At most 12 digits');

/** PATCH /organization/settings. All fields optional; unknown fields (e.g. id, organizationId) are dropped. */
export const updateOrganizationSettingsSchema = z.object({
  name: requiredText(120, 'Company name').optional(),
  address: optionalText(300),
  town: optionalText(100),
  phone: optionalText(40),
  ntn: optionalText(40),
  strn: optionalText(40),
  logoUrl: z
    .string()
    .trim()
    .max(2048)
    .transform((v) => (v === '' ? null : v))
    .pipe(z.url({ protocol: /^https?$/, message: 'Enter a valid http(s) image URL' }).nullable())
    .nullable()
    .optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code, e.g. PKR')
    .optional(),
  timezone: z.string().trim().refine(isValidTimeZone, 'Unknown timezone').optional(),
  invoicePrefix: prefix.optional(),
  invoiceNumberDigits: numberDigits.optional(),
  orderPrefix: prefix.optional(),
  orderNumberDigits: numberDigits.optional(),
  defaultTaxRate: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Enter a percentage like 18 or 17.5')
    .refine((v) => Number(v) <= 100, 'Must be 100 or less')
    .optional(),
  /** May only move forward (never reuse an invoice number). */
  nextInvoiceNumber: z.coerce
    .number({ message: 'Enter a number' })
    .int('Enter a whole number')
    .min(1)
    .max(2_000_000_000)
    .optional(),
});
export type UpdateOrganizationSettingsInput = z.input<typeof updateOrganizationSettingsSchema>;
export type UpdateOrganizationSettings = z.output<typeof updateOrganizationSettingsSchema>;

/** Formats a document number the same way the api does: prefix + zero-padded value. */
export function formatDocumentNumber(prefix: string, digits: number, value: number): string {
  return `${prefix}${String(value).padStart(digits, '0')}`;
}
