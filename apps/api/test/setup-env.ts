import { join } from 'node:path';

/** Loads .env.test before any module (incl. ConfigModule/Prisma) reads process.env. */
export function loadTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.loadEnvFile(join(__dirname, '..', '.env.test'));
}

loadTestEnv();
