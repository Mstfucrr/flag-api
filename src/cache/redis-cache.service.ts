import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * İnce JSON yardımcıları — iş mantığı burada değil; `RedisService` üzerinden erişim.
 */
@Injectable()
export class RedisCacheService {
  constructor(private readonly redis: RedisService) {}

  async getJson<T>(key: string): Promise<T | null> {
    return this.redis.get<T>(key);
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const ttl = ttlSeconds ?? 0;
    await this.redis.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    await this.redis.delByPattern(pattern);
  }

  async incr(key: string): Promise<number | null> {
    return this.redis.incr(key);
  }
}
