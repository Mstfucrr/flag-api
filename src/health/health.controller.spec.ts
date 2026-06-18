import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  const health = {
    liveness: jest.fn(),
    readiness: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns liveness without checking dependencies', () => {
    health.liveness.mockReturnValue({ status: 'ok' });

    expect(controller.live()).toEqual({ status: 'ok' });
    expect(health.readiness).not.toHaveBeenCalled();
  });

  it('returns degraded readiness when only Redis is down', async () => {
    const result = {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'up' },
        redis: { status: 'down' },
      },
    };
    health.readiness.mockResolvedValue(result);

    await expect(controller.ready()).resolves.toEqual(result);
  });

  it('returns 503 when PostgreSQL is down', async () => {
    health.readiness.mockResolvedValue({
      status: 'error',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'down' },
        redis: { status: 'up' },
      },
    });

    await expect(controller.ready()).rejects.toBeInstanceOf(HttpException);
  });
});
