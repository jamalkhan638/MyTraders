import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { loadTestEnv } from './setup-env';

/** Applies pending migrations to the test database once per test run (non-destructive). */
export default function globalSetup(): void {
  loadTestEnv();
  if (!process.env.DATABASE_URL?.includes('_test')) {
    throw new Error('Refusing to reset a database whose name does not contain "_test"');
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}
