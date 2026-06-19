import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import flagsConfig from '../config/flags.config';
import { RequestLogService } from '../request-log/request-log.service';
import { FeatureFlagRuntimeCacheService } from './cache/feature-flag-runtime-cache.service';
import {
  FLAGS_PERSISTENCE,
  type IFlagsPersistence,
} from './flags-persistence.repository';
import { FlagsSdkController } from './flags-sdk.controller';
import { FlagsService } from './flags.service';
import { MemoryFlagsPersistence } from './memory-flags-persistence';
import { FiyuuThrottlerGuard } from '../throttling/fiyuu-throttler.guard';

describe('FlagsSdkController', () => {
  let controller: FlagsSdkController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [flagsConfig],
        }),
      ],
      controllers: [FlagsSdkController],
      providers: [
        FlagsService,
        { provide: FLAGS_PERSISTENCE, useClass: MemoryFlagsPersistence },
        { provide: RequestLogService, useValue: { append: jest.fn() } },
        {
          provide: FeatureFlagRuntimeCacheService,
          useFactory: (flags: IFlagsPersistence) => ({
            loadOrRebuildSnapshotForEvaluate: async (pk: string) => {
              const rows = await flags.listByProject(pk);
              const byKey: Record<
                string,
                { enabled: boolean; rules: (typeof rows)[0]['rules'] }
              > = {};
              for (const r of rows) {
                byKey[r.key] = {
                  enabled: r.enabled,
                  rules: structuredClone(r.rules),
                };
              }
              return { builtAt: new Date().toISOString(), byKey };
            },
            refreshRuntimeCacheAfterMutation: jest
              .fn()
              .mockResolvedValue(undefined),
            clearProjectRuntime: jest.fn().mockResolvedValue(undefined),
            refreshRuntimeCacheManual: jest.fn(),
          }),
          inject: [FLAGS_PERSISTENCE],
        },
      ],
    });
    const module: TestingModule = await moduleBuilder
      .overrideGuard(FiyuuThrottlerGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<FlagsSdkController>(FlagsSdkController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
