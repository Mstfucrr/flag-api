import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: RedisClientType | null = null;
    private enabled = false;
    private keyPrefix = '';

    constructor(private readonly config: ConfigService) {}

    async onModuleInit(): Promise<void> {
        this.enabled = this.config.get<boolean>('redis.enabled', false);
        this.keyPrefix = this.config.get<string>('redis.keyPrefix', 'flag-api:');
        if (!this.enabled) {
            this.logger.log('Redis disabled (REDIS_ENABLED=false).');
            return;
        }

        const host = this.config.get<string>('redis.host', 'localhost');
        const port = this.config.get<number>('redis.port', 6379);
        const password = this.config.get<string>('redis.password', '');
        const db = this.config.get<number>('redis.db', 0);
        const url =
            password.trim().length > 0
                ? `redis://:${encodeURIComponent(password)}@${host}:${port}/${db}`
                : `redis://${host}:${port}/${db}`;

        this.client = createClient({ url });
        this.client.on('error', (err: unknown) => {
            this.logger.error(`Redis Client Error (${host}:${port}, db: ${db})`, err);
        });
        this.client.on('reconnecting', () => {
            this.logger.warn(`Redis reconnecting to ${host}:${port} (db: ${db})...`);
        });

        try {
            await this.client.connect();
            this.logger.log(`Redis connected to ${host}:${port} (db: ${db})`);
        } catch (err: unknown) {
            this.logger.error('Redis connection failed; cache will be bypassed.', err);
            this.client = null;
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.client && this.client.isOpen) {
            await this.client.quit();
            this.logger.log('Redis connection closed');
        }
        this.client = null;
    }

    /** Redis açık ve bağlantı hazır mı. */
    isReady(): boolean {
        return this.enabled && this.client?.isOpen === true;
    }

    /** Redis PING; kapalıysa veya hata varsa `false`. */
    async ping(): Promise<boolean> {
        if (!this.isReady()) {
            return false;
        }

        try {
            return (await this.client!.ping()) === 'PONG';
        } catch (err: unknown) {
            this.logger.warn('Redis health check failed', err);
            return false;
        }
    }

    private key(raw: string): string {
        return `${this.keyPrefix}${raw}`;
    }

    /**
     * JSON get. Prefix otomatik eklenir.
     *
     * @param key - Mantıksal anahtar
     * @returns Parse edilmiş değer veya yoksa / Redis kapalıysa `null`
     *
     * @example
     * ```ts
     * await get('ff:runtime:flags:portal')
     * ```
     */
    async get<T>(key: string): Promise<T | null> {
        if (!this.isReady()) {
            return null;
        }
        try {
            const raw = await this.client!.get(this.key(key));
            if (!raw) {
                return null;
            }
            return JSON.parse(raw) as T;
        } catch (err: unknown) {
            this.logger.warn(`Redis get failed for key=${key}`, err);
            return null;
        }
    }

    /**
     * JSON set. `ttlSeconds > 0` ise EXPIRE uygulanır. Redis kapalıysa no-op.
     *
     * @param key - Mantıksal anahtar
     * @param value - Saklanacak değer
     * @param ttlSeconds - 0 = süresiz
     *
     * @example
     * ```ts
     * await set('ff:runtime:flags:portal', snapshot, 0)
     * ```
     */
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
        if (!this.isReady()) {
            return;
        }
        try {
            const payload = JSON.stringify(value);
            if (ttlSeconds > 0) {
                await this.client!.setEx(this.key(key), ttlSeconds, payload);
            } else {
                await this.client!.set(this.key(key), payload);
            }
        } catch (err: unknown) {
            this.logger.warn(`Redis set failed for key=${key}`, err);
        }
    }

    /**
     * Anahtar siler. Redis kapalıysa no-op.
     *
     * @param key - Mantıksal anahtar
     *
     * @example
     * ```ts
     * await del('ff:runtime:flags:portal')
     * ```
     */
    async del(key: string): Promise<void> {
        if (!this.isReady()) {
            return;
        }
        try {
            await this.client!.del(this.key(key));
        } catch (err: unknown) {
            this.logger.warn(`Redis del failed for key=${key}`, err);
        }
    }

    /**
     * Atomik sayaç (runtime sürümü). Redis kapalıysa `null`.
     *
     * @param key - Sayacın anahtarı
     * @returns Yeni değer veya `null`
     *
     * @example
     * ```ts
     * await incr('ff:runtime:version:portal')
     * // 4
     * ```
     */
    async incr(key: string): Promise<number | null> {
        if (!this.isReady()) {
            return null;
        }
        try {
            return await this.client!.incr(this.key(key));
        } catch (err: unknown) {
            this.logger.warn(`Redis incr failed for key=${key}`, err);
            return null;
        }
    }

    /**
     * Glob desene uyan anahtarları siler (`SCAN MATCH`). Prefix otomatik eklenir.
     *
     * @param pattern - Mantıksal glob, örn. `ff:runtime:flags:*`
     *
     * @example
     * ```ts
     * await delByPattern('ff:runtime:flags:*')
     * ```
     */
    async delByPattern(pattern: string): Promise<void> {
        if (!this.isReady()) {
            return;
        }
        const match = this.key(pattern);
        try {
            for await (const redisKey of this.client!.scanIterator({
                MATCH: match,
                COUNT: 128,
            })) {
                await this.client!.del(redisKey);
            }
        } catch (err: unknown) {
            this.logger.warn(`Redis scan/del failed for pattern=${pattern}`, err);
        }
    }
}
