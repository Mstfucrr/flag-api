import { registerAs } from '@nestjs/config';

/**
 * PostgreSQL connection. Prefer `DATABASE_URL`; otherwise `DB_*` (or legacy `DATABASE_*`).
 * Set `DB_SYNC=true` locally so TypeORM can create/update tables (turn off in production).
 */
export default registerAs('database', () => ({
  url: (process.env.DATABASE_URL ?? '').trim(),
  host: process.env.DB_HOST ?? process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(
    process.env.DB_PORT ?? process.env.DATABASE_PORT ?? '5432',
    10,
  ),
  user: process.env.DB_USER ?? process.env.DATABASE_USER ?? '',
  password: process.env.DB_PASSWORD ?? process.env.DATABASE_PASSWORD ?? '',
  name: process.env.DB_NAME ?? process.env.DATABASE_NAME ?? 'myapp',
  sync: process.env.DB_SYNC === 'true',
  poolMax: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
  poolConnectionTimeoutMs: parseInt(
    process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? '5000',
    10,
  ),
}));
