import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  close(): Promise<void>;
}

/** Boots the real AppModule (same guards, pipes, filters as production) for e2e tests. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, close: () => app.close() };
}

/** Empties all tables. Each test file starts from a clean database. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  if (!process.env.DATABASE_URL?.includes('_test')) {
    throw new Error('Refusing to truncate a database whose name does not contain "_test"');
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "RefreshToken", "OrganizationCounter", "User", "Organization" CASCADE',
  );
}
