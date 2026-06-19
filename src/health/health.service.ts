import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

type DependencyStatus = 'up' | 'down' | 'disabled';

interface DependencyCheck {
  status: DependencyStatus;
  latencyMs?: number;
}

export interface HealthResult {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    database: DependencyCheck;
    redis: DependencyCheck;
  };
}

const CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<HealthResult> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const status =
      database.status === 'down'
        ? 'error'
        : redis.status === 'down'
          ? 'degraded'
          : 'ok';

    return {
      status,
      timestamp: new Date().toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
      }),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    return this.timedCheck(async () => {
      await this.dataSource.query('SELECT 1');
      return true;
    });
  }

  private async checkRedis(): Promise<DependencyCheck> {
    const enabled = this.config.get<boolean>('redis.enabled', false);
    if (!enabled) {
      return { status: 'disabled' };
    }
    return this.timedCheck(() => this.redis.ping());
  }

  private async timedCheck(
    check: () => Promise<boolean>,
  ): Promise<DependencyCheck> {
    const startedAt = performance.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const healthy = await Promise.race([
        check(),
        new Promise<boolean>(
          (resolve) =>
            (timeout = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS)),
        ),
      ]);

      return {
        status: healthy ? 'up' : 'down',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch {
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }
  }
}
