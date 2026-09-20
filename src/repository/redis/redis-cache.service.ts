import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * İnce JSON yardımcıları — iş mantığı burada değil; `RedisService` üzerinden erişim.
 */
@Injectable()
export class RedisCacheService {
    constructor(private readonly redis: RedisService) {}

    /**
     * JSON değeri okur.
     *
     * @param key - Mantıksal Redis anahtarı
     * @returns Parse edilmiş değer veya yoksa / Redis kapalıysa `null`
     *
     * @example
     * ```ts
     * await getJson('ff:runtime:flags:portal')
     * ```
     */
    async getJson<T>(key: string): Promise<T | null> {
        return this.redis.get<T>(key);
    }

    /**
     * JSON yazar. `ttlSeconds` 0 = süresiz.
     *
     * @param key - Mantıksal anahtar
     * @param value - Saklanacak değer
     * @param ttlSeconds - Saniye; verilmezse veya 0 ise expire yok
     *
     * @example
     * ```ts
     * await setJson('ff:runtime:flags:portal', snapshot, 0)
     * ```
     */
    async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
        const ttl = ttlSeconds ?? 0;
        await this.redis.set(key, value, ttl);
    }

    /**
     * Tek anahtar siler.
     *
     * @param key - Mantıksal anahtar
     *
     * @example
     * ```ts
     * await del('ff:runtime:flags:portal')
     * ```
     */
    async del(key: string): Promise<void> {
        await this.redis.del(key);
    }

    /**
     * Desene uyan anahtarları siler.
     *
     * @param pattern - Glob pattern
     *
     * @example
     * ```ts
     * await delByPattern('ff:runtime:flags:*')
     * ```
     */
    async delByPattern(pattern: string): Promise<void> {
        await this.redis.delByPattern(pattern);
    }

    /**
     * Sayısal değeri 1 artırır.
     *
     * @param key - Sayacın anahtarı
     * @returns Yeni değer; Redis kapalıysa `null`
     *
     * @example
     * ```ts
     * await incr('ff:runtime:version:portal')
     * // 4
     * ```
     */
    async incr(key: string): Promise<number | null> {
        return this.redis.incr(key);
    }
}
