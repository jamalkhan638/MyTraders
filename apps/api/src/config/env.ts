import { z } from 'zod';

/** Environment variables, validated once at startup. The app refuses to boot if invalid. */
export const envObjectSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  /**
   * Express "trust proxy": which proxies may set X-Forwarded-For, so the login rate limit and the
   * logs see the real client IP. "loopback" (a reverse proxy on the same machine), a number of
   * hops (e.g. 1 behind one load balancer), a comma-separated list of addresses / CIDRs, or
   * "false" when the API is reached directly.
   */
  TRUST_PROXY: z
    .string()
    .trim()
    .default('loopback')
    .transform((v): boolean | number | string =>
      v === 'false' ? false : v === 'true' ? true : /^\d+$/.test(v) ? Number(v) : v,
    ),
});

/** Placeholder secrets from .env.example that must never reach production. */
const EXAMPLE_SECRET = /change-me/i;

export const envSchema = envObjectSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  if (!env.COOKIE_SECURE) {
    ctx.addIssue({
      code: 'custom',
      path: ['COOKIE_SECURE'],
      message: 'must be true in production (the refresh cookie needs HTTPS)',
    });
  }
  if (EXAMPLE_SECRET.test(env.JWT_ACCESS_SECRET)) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_ACCESS_SECRET'],
      message: 'still the example value; generate one with `openssl rand -base64 48`',
    });
  }
  if (env.TRUST_PROXY === true) {
    ctx.addIssue({
      code: 'custom',
      path: ['TRUST_PROXY'],
      message: 'use a hop count or proxy addresses, not "true" (clients could fake their IP)',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
