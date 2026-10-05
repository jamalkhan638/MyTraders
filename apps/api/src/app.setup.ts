import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { type Env } from './config/env';
import { REFRESH_COOKIE_NAME } from './modules/auth/refresh-cookie';

export const API_PREFIX = 'api';

/** HTTP-level setup shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }).split(','),
    credentials: true,
  });
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('MyTraders API')
        .setDescription('Distribution Management SaaS — see /docs in the repository')
        .setVersion('0.1.0')
        .addBearerAuth()
        .addCookieAuth(REFRESH_COOKIE_NAME)
        .build(),
    );
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, cleanupOpenApiDoc(document));
  }
}
