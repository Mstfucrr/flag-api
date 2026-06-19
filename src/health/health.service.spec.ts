import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const dataSource = { query: jest.fn() };
  const redis = { ping: jest.fn() };
  const config = { get: jest.fn() };
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(
      dataSource as unknown as DataSource,
      redis as unknown as RedisService,
      config as unknown as ConfigService,
    );
  });

  it('is ready when PostgreSQL and Redis are healthy', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    config.get.mockReturnValue(true);
    redis.ping.mockResolvedValue(true);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.redis.status).toBe('up');
  });

  it('is degraded when optional Redis is enabled but unavailable', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    config.get.mockReturnValue(true);
    redis.ping.mockResolvedValue(false);

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.redis.status).toBe('down');
  });

  it('reports Redis as disabled when it is not configured', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    config.get.mockReturnValue(false);

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.checks.redis.status).toBe('disabled');
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('is not ready when PostgreSQL is unavailable', async () => {
    dataSource.query.mockRejectedValue(new Error('connection failed'));
    config.get.mockReturnValue(false);

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.checks.database.status).toBe('down');
  });
});
