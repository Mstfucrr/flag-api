import { registerAs } from '@nestjs/config';

/**
 * PostgreSQL settings reserved for a future persistence layer (TypeORM / Prisma).
 * Projects and flags currently use in-memory stores; no DB connection is opened.
 */
export default registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? '',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  user: process.env.DATABASE_USER ?? '',
  password: process.env.DATABASE_PASSWORD ?? '',
  name: process.env.DATABASE_NAME ?? 'feature_flags',
}));
