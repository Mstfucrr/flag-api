if (process.env.ENABLE_METRICS === 'TRUE') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initInstana = require('@instana/collector') as (
    config: Record<string, unknown>,
  ) => unknown;
  initInstana({
    agentHost: process.env.INSTANA_HOST,
    agentPort: Number(process.env.INSTANA_PORT),
    level: process.env.INSTANA_LEVEL,
    serviceName: process.env.INSTANA_SERVICE_NAME,
  });
}

import { Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const VALID_LOG_LEVELS = new Set<LogLevel>([
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
]);

function configuredLogLevels(): LogLevel[] | undefined {
  const levels = (process.env.LOG_LEVEL ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is LogLevel =>
      VALID_LOG_LEVELS.has(value as LogLevel),
    );
  return levels.length > 0 ? levels : undefined;
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  if (!(process.env.FLAGS_API_KEY ?? '').trim()) {
    logger.fatal(
      'FLAGS_API_KEY is required and must not be empty. Refusing to start.',
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, {
    logger: configuredLogLevels(),
  });
  app.enableShutdownHooks();
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Principal-Id',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Feature Flag API')
    .setDescription(
      'Feature flags backed by PostgreSQL (TypeORM), linear versioning, and rollback.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`HTTP server listening on port ${port} (Swagger: /docs)`);
}
void bootstrap();
