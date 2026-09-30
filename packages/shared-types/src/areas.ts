import { z } from 'zod';
import { cleanName, paginatedSchema, paginationQuerySchema } from './common';

export const AREA_NAME_MAX = 100;

export const areaSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Area = z.infer<typeof areaSchema>;

export const areaListSchema = paginatedSchema(areaSchema);

/** GET /areas query. */
export const listAreasQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export type ListAreasQuery = z.output<typeof listAreasQuerySchema>;
export type ListAreasQueryInput = z.input<typeof listAreasQuerySchema>;

const areaName = z
  .string({ message: 'Area name is required' })
  .transform(cleanName)
  .pipe(
    z
      .string()
      .min(1, 'Area name is required')
      .max(AREA_NAME_MAX, `Area name must be at most ${AREA_NAME_MAX} characters`),
  );

/** POST /areas */
export const createAreaSchema = z.object({ name: areaName });
export type CreateAreaInput = z.input<typeof createAreaSchema>;

/** PATCH /areas/:id — rename and/or activate/deactivate. */
export const updateAreaSchema = z.object({
  name: areaName.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAreaInput = z.input<typeof updateAreaSchema>;
