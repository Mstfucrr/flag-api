import { registerAs } from '@nestjs/config';

function toInt(value: string | undefined, fallback: number): number {
    const parsed = parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
        return true;
    }
    if (normalized === 'false') {
        return false;
    }
    return fallback;
}

export default registerAs('redis', () => ({
    enabled: toBool(process.env.REDIS_ENABLED, false),
    host: process.env.REDIS_HOST ?? 'localhost',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD ?? '',
    db: toInt(process.env.REDIS_DB, 0),
    /** Tüm anahtarlara eklenen önek (`RedisService`). */
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'flag-api:',
}));
