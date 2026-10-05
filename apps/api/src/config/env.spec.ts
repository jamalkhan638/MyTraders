import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/mytraders_dev',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
};

describe('validateEnv', () => {
  it('accepts a development configuration with defaults', () => {
    const env = validateEnv({ ...base, COOKIE_SECURE: 'false' });
    expect(env).toMatchObject({ NODE_ENV: 'development', PORT: 3000, TRUST_PROXY: 'loopback' });
  });

  it('refuses short secrets and missing database URLs', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: 'short' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/32 characters/);
  });

  it('refuses unsafe production settings', () => {
    const prod = { ...base, NODE_ENV: 'production' };
    expect(() => validateEnv({ ...prod, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() =>
      validateEnv({
        ...prod,
        JWT_ACCESS_SECRET: 'change-me-to-a-long-random-string-at-least-32-chars',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...prod, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
    expect(validateEnv({ ...prod, TRUST_PROXY: '1' })).toMatchObject({
      COOKIE_SECURE: true,
      TRUST_PROXY: 1,
    });
  });
});
