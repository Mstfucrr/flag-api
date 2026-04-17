import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import {
  type FlagAggregate,
  type IFlagsPersistence,
  FlagsPersistenceRepository,
} from './flags-persistence.repository';

@Injectable()
export class CachedFlagsPersistence implements IFlagsPersistence {
  private readonly ttlSeconds: number;

  constructor(
    private readonly inner: FlagsPersistenceRepository,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    const ttlMs = config.get<number>('redis.flagsCacheTtlMs', 5000);
    this.ttlSeconds = ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 0;
  }

  private rowId(projectKey: string, flagKey: string): string {
    return `${projectKey.trim()}\x1f${flagKey.trim()}`;
  }

  private listId(projectKey: string): string {
    return `flags:list:${projectKey.trim()}`;
  }

  private canCache(): boolean {
    return this.ttlSeconds > 0 && this.redis.isReady();
  }

  private async cacheSet<T>(key: string, value: T): Promise<void> {
    if (!this.canCache()) {
      return;
    }
    await this.redis.set(key, value, this.ttlSeconds);
  }

  private async evict(projectKey: string, flagKey?: string): Promise<void> {
    if (!this.redis.isReady()) {
      return;
    }
    await this.redis.del(this.listId(projectKey));
    if (flagKey) {
      await this.redis.del(this.rowId(projectKey, flagKey));
    }
  }

  async findByLookup(projectKey: string, flagKeyLookup: string) {
    const key = this.rowId(projectKey, flagKeyLookup);
    if (this.canCache()) {
      const hit = await this.redis.get<FlagAggregate>(key);
      if (hit) {
        return hit;
      }
    }
    const row = await this.inner.findByLookup(projectKey, flagKeyLookup);
    if (row) {
      await this.cacheSet(key, row);
      return structuredClone(row);
    }
    return null;
  }

  async existsByProjectAndFlagKey(projectKey: string, flagKey: string) {
    return this.inner.existsByProjectAndFlagKey(projectKey, flagKey);
  }

  async listByProject(projectKey: string) {
    const listKey = this.listId(projectKey);
    if (this.canCache()) {
      const hit = await this.redis.get<FlagAggregate[]>(listKey);
      if (hit) {
        return hit;
      }
    }

    const rows = await this.inner.listByProject(projectKey);
    await this.cacheSet(listKey, rows);
    for (const row of rows) {
      await this.cacheSet(this.rowId(projectKey, row.key), row);
    }
    return rows.map((row) => structuredClone(row));
  }

  async findManyByProjectAndKeys(projectKey: string, flagKeys: string[]) {
    const keys = [...new Set(flagKeys.map((k) => k.trim()).filter(Boolean))];
    const out = new Map<string, FlagAggregate>();
    if (keys.length === 0) {
      return out;
    }

    const misses = new Set(keys);
    if (this.canCache()) {
      await Promise.all(
        keys.map(async (key) => {
          const hit = await this.redis.get<FlagAggregate>(
            this.rowId(projectKey, key),
          );
          if (hit) {
            out.set(key, hit);
            misses.delete(key);
          }
        }),
      );
    }

    if (misses.size > 0) {
      const loaded = await this.inner.findManyByProjectAndKeys(projectKey, [
        ...misses,
      ]);
      for (const [k, v] of loaded) {
        await this.cacheSet(this.rowId(projectKey, k), v);
        out.set(k, structuredClone(v));
      }
    }

    return out;
  }

  async insert(agg: FlagAggregate) {
    await this.inner.insert(agg);
    await this.evict(agg.projectKey);
    await this.cacheSet(this.rowId(agg.projectKey, agg.key), agg);
  }

  async updateByLookup(agg: FlagAggregate, lookupFlagKey: string) {
    await this.inner.updateByLookup(agg, lookupFlagKey);
    await this.evict(agg.projectKey, lookupFlagKey);
    await this.evict(agg.projectKey, agg.key);
    await this.cacheSet(this.rowId(agg.projectKey, agg.key), agg);
  }

  async delete(projectKey: string, flagKey: string) {
    await this.inner.delete(projectKey, flagKey);
    await this.evict(projectKey, flagKey);
  }
}
