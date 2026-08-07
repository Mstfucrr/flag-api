import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import flagsConfig from '../../../src/config/flags.config';
import { RequestLogService } from '../../../src/repository/request-log/request-log.service';
import { FeatureFlagRuntimeCacheService } from '../../../src/repository/flags/cache/feature-flag-runtime-cache.service';
import { FLAGS_PERSISTENCE, type IFlagsPersistence } from '../../../src/repository/flags/flags-persistence.repository';
import { FlagsSdkController } from '../../../src/features/flags/flags-sdk.controller';
import { FlagsService } from '../../../src/features/flags/flags.service';
import { MemoryFlagsPersistence } from '../../../src/repository/flags/memory-flags-persistence';
import { FiyuuThrottlerGuard } from '../../../src/common/throttling/fiyuu-throttler.guard';

describe('FlagsSdkController', () => {
    let controller: FlagsSdkController;
    let service: FlagsService;

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
                            const byKey: Record<string, { enabled: boolean; rules: (typeof rows)[0]['rules'] }> = {};
                            for (const r of rows) {
                                byKey[r.key] = {
                                    enabled: r.enabled,
                                    rules: structuredClone(r.rules),
                                };
                            }
                            return { builtAt: new Date().toISOString(), byKey };
                        },
                        refreshRuntimeCacheAfterMutation: jest.fn().mockResolvedValue(undefined),
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
        service = module.get<FlagsService>(FlagsService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('evaluateBatch', () => {
        it('delegates to FlagsService.evaluateBatch and returns per-group results', async () => {
            await service.create(
                {
                    projectKey: 'acme',
                    key: 'x_flag',
                    enabled: true,
                    rules: [],
                },
                'u1',
            );

            const out = await controller.evaluateBatch('acme', {
                groups: [
                    { id: 'row-1', flagKeys: ['x_flag'], context: {} },
                    { id: 'row-2', flagKeys: ['x_flag'], context: {} },
                ],
            });

            expect(out).toEqual({
                results: {
                    'row-1': { results: { x_flag: { enabled: true } } },
                    'row-2': { results: { x_flag: { enabled: true } } },
                },
            });
        });
    });
});
