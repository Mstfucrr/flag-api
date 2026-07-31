import type { FlagAggregate } from '../../../src/repository/flags/flags-persistence.repository';
import type { FlagsPersistenceRepository } from '../../../src/repository/flags/flags-persistence.repository';
import type { RedisCacheService } from '../../../src/repository/redis/redis-cache.service';
import { FeatureFlagRuntimeCacheService } from '../../../src/repository/flags/cache/feature-flag-runtime-cache.service';

function fakeFlag(key: string): FlagAggregate {
    return {
        projectKey: 'p',
        key,
        description: '',
        enabled: true,
        rules: [],
        currentVersion: 1,
        updatedAt: new Date().toISOString(),
        versions: [],
    };
}

describe('FeatureFlagRuntimeCacheService', () => {
    it('collapses concurrent cache-miss evaluate calls into a single DB read (no stampede)', async () => {
        let listByProjectCalls = 0;
        const fakeRepo: Pick<FlagsPersistenceRepository, 'listByProject'> = {
            listByProject: jest.fn(async (projectKey: string) => {
                listByProjectCalls += 1;
                // Gerçek DB round-trip'i taklit etmek için ufak bir gecikme —
                // eşzamanlı çağrıların birbirini beklemesini (stampede'i) sınamak için gerekli.
                await new Promise((resolve) => setTimeout(resolve, 10));
                return [fakeFlag(`${projectKey}-flag`)];
            }),
        };

        // Redis her zaman cache-miss döner; hiçbir çağrı gerçek Redis'e gitmez.
        const fakeRedisCache: Pick<RedisCacheService, 'getJson' | 'setJson'> = {
            getJson: jest.fn(() => Promise.resolve(null)),
            setJson: jest.fn(() => Promise.resolve(undefined)),
        };

        const service = new FeatureFlagRuntimeCacheService(
            fakeRedisCache as RedisCacheService,
            fakeRepo as FlagsPersistenceRepository,
        );

        const results = await Promise.all([
            service.loadOrRebuildSnapshotForEvaluate('proj'),
            service.loadOrRebuildSnapshotForEvaluate('proj'),
            service.loadOrRebuildSnapshotForEvaluate('proj'),
        ]);

        expect(listByProjectCalls).toBe(1);
        for (const r of results) {
            expect(r.byKey['proj-flag']).toEqual({ enabled: true, rules: [] });
        }
    });

    it('rebuilds again on a later, separate cache-miss (in-flight entry cleared after completion)', async () => {
        let listByProjectCalls = 0;
        const fakeRepo: Pick<FlagsPersistenceRepository, 'listByProject'> = {
            listByProject: jest.fn((projectKey: string) => {
                listByProjectCalls += 1;
                return Promise.resolve([fakeFlag(`${projectKey}-flag`)]);
            }),
        };
        const fakeRedisCache: Pick<RedisCacheService, 'getJson' | 'setJson'> = {
            getJson: jest.fn(() => Promise.resolve(null)),
            setJson: jest.fn(() => Promise.resolve(undefined)),
        };

        const service = new FeatureFlagRuntimeCacheService(
            fakeRedisCache as RedisCacheService,
            fakeRepo as FlagsPersistenceRepository,
        );

        await service.loadOrRebuildSnapshotForEvaluate('proj');
        await service.loadOrRebuildSnapshotForEvaluate('proj');

        expect(listByProjectCalls).toBe(2);
    });
});
