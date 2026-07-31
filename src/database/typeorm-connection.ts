/**
 * Framework'ten bağımsız (Nest DI kullanmaz) bağlantı ayarları — hem
 * `DatabaseModule` (runtime) hem `data-source.ts` (TypeORM CLI: migration
 * üretme/çalıştırma) tarafından kullanılır. Aynı mantığın iki yerde
 * kopyalanıp zamanla birbirinden sapmasını önler.
 */
export interface TypeOrmConnectionEnv {
    url: string;
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    poolMax: number;
    poolConnectionTimeoutMs: number;
}

/** `database.config.ts` ile aynı env var adları ve varsayılanlar. */
export function readTypeOrmConnectionEnvFromProcess(): TypeOrmConnectionEnv {
    return {
        url: (process.env.DATABASE_URL ?? '').trim(),
        host: process.env.DB_HOST ?? process.env.DATABASE_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? process.env.DATABASE_PORT ?? '5432', 10),
        user: process.env.DB_USER ?? process.env.DATABASE_USER ?? '',
        password: process.env.DB_PASSWORD ?? process.env.DATABASE_PASSWORD ?? '',
        name: process.env.DB_NAME ?? process.env.DATABASE_NAME ?? 'myapp',
        poolMax: parseInt(process.env.DB_POOL_MAX ?? '20', 10),
        poolConnectionTimeoutMs: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? '5000', 10),
    };
}

export interface TypeOrmConnectionOptions {
    url?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    extra: { max: number; connectionTimeoutMillis: number };
}

export function buildTypeOrmConnectionOptions(env: TypeOrmConnectionEnv): TypeOrmConnectionOptions {
    const extra = {
        max: env.poolMax,
        connectionTimeoutMillis: env.poolConnectionTimeoutMs,
    };
    if (env.url) {
        return { url: env.url, extra };
    }
    return {
        host: env.host,
        port: env.port,
        username: env.user,
        password: env.password,
        database: env.name,
        extra,
    };
}
