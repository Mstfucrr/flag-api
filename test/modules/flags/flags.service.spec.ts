import type { RuleOperator } from '@core-sdk/feature-flags-core';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RequestLogService } from '../../../src/repository/request-log/request-log.service';
import { FeatureFlagRuntimeCacheService } from '../../../src/repository/flags/cache/feature-flag-runtime-cache.service';
import { FLAGS_PERSISTENCE, type IFlagsPersistence } from '../../../src/repository/flags/flags-persistence.repository';
import { FlagsAdminService } from '../../../src/features/flags/admin/flags-admin.service';
import { FlagsRuntimeService } from '../../../src/features/flags/runtime/flags-runtime.service';
import { MemoryFlagsPersistence } from '../../../src/repository/flags/memory-flags-persistence';

const oneFilterCondition = (id: string, field: string, operator: RuleOperator, value: unknown, active = true) => ({
    id,
    active,
    filters: [{ field, operator, value }],
});

describe('Flags admin/runtime services', () => {
    let admin: FlagsAdminService;
    let runtime: FlagsRuntimeService;
    let runtimeCache: FeatureFlagRuntimeCacheService;
    const mockRequestLog = { append: jest.fn().mockResolvedValue(undefined) };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FlagsAdminService,
                FlagsRuntimeService,
                { provide: FLAGS_PERSISTENCE, useClass: MemoryFlagsPersistence },
                { provide: RequestLogService, useValue: mockRequestLog },
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
        }).compile();

        admin = module.get(FlagsAdminService);
        runtime = module.get(FlagsRuntimeService);
        runtimeCache = module.get<FeatureFlagRuntimeCacheService>(FeatureFlagRuntimeCacheService);
    });

    it('should be defined', () => {
        expect(admin).toBeDefined();
        expect(runtime).toBeDefined();
    });

    describe('visibility', () => {
        it('runtime list exposes only evaluation-safe fields', async () => {
            await admin.create(
                {
                    projectKey: 'proj-safe',
                    key: 'chat',
                    enabled: true,
                    rules: [oneFilterCondition('r1', 'accountId', 'eq', '123')],
                },
                'u1',
            );

            const [row] = await runtime.findAll('proj-safe');
            expect(row).toEqual({
                key: 'chat',
            });
            expect(row).not.toHaveProperty('versions');
            expect(row).not.toHaveProperty('currentVersion');
            expect(row).not.toHaveProperty('updatedAt');
            expect(row).not.toHaveProperty('description');
        });

        it('admin list exposes current metadata but not version snapshots by default', async () => {
            await admin.create(
                {
                    projectKey: 'proj-admin',
                    key: 'chat',
                    description: 'desc',
                    enabled: true,
                    rules: [],
                },
                'u1',
            );

            const [row] = await admin.findAllAdmin('proj-admin');
            expect(row).toMatchObject({
                projectKey: 'proj-admin',
                key: 'chat',
                description: 'desc',
                enabled: true,
                currentVersion: 1,
            });
            expect(row).not.toHaveProperty('versions');
        });
    });

    describe('getHistory', () => {
        it('returns versions with createdBy, no audit payload', async () => {
            await admin.create(
                {
                    projectKey: 'p',
                    key: 'f1',
                    enabled: true,
                    rules: [],
                },
                'alice',
            );
            const h = await admin.getHistory('p', 'f1');
            expect(h.flagKey).toBe('f1');
            expect(h).not.toHaveProperty('audit');
            expect(h.versions).toHaveLength(1);
            expect(h.versions[0]).toMatchObject({
                version: 1,
                createdBy: 'alice',
            });
        });
    });

    describe('update', () => {
        it('description-only update does not bump version', async () => {
            await admin.create(
                {
                    projectKey: 'p',
                    key: 'immutable-key',
                    description: 'v1',
                    enabled: true,
                    rules: [],
                },
                'u1',
            );
            const after = await admin.update('p', 'immutable-key', { description: 'v2' }, 'u2');
            expect(after.key).toBe('immutable-key');
            expect(after.description).toBe('v2');
            expect(after.currentVersion).toBe(1);
            const h = await admin.getHistory('p', 'immutable-key');
            expect(h.versions).toHaveLength(1);
        });

        it('rule change bumps version', async () => {
            await admin.create(
                {
                    projectKey: 'p',
                    key: 'rule-bump',
                    description: 'd',
                    enabled: true,
                    rules: [oneFilterCondition('r1', 'x', 'eq', 1)],
                },
                'u1',
            );
            const after = await admin.update(
                'p',
                'rule-bump',
                {
                    rules: [oneFilterCondition('r1', 'x', 'eq', 2)],
                },
                'u2',
            );
            expect(after.currentVersion).toBe(2);
        });
    });

    describe('rollback', () => {
        it('restores snapshot fields but keeps aggregate key', async () => {
            await admin.create(
                {
                    projectKey: 'p',
                    key: 'roll-key',
                    description: 'a',
                    enabled: true,
                    rules: [oneFilterCondition('r1', 'x', 'eq', 1)],
                },
                'u1',
            );
            await admin.update('p', 'roll-key', { description: 'b', rules: [] }, 'u2');
            const rolled = await admin.rollback('p', 'roll-key', 1, 'u3');
            expect(rolled.key).toBe('roll-key');
            expect(rolled.description).toBe('a');
            expect(rolled.rules).toHaveLength(1);
            expect(rolled.currentVersion).toBe(3);
        });
    });

    describe('setEnabled', () => {
        it('toggles enabled without new flag version', async () => {
            await admin.create(
                {
                    projectKey: 'p',
                    key: 'f1',
                    enabled: false,
                    rules: [],
                },
                'u1',
            );
            const after = await admin.setEnabled('p', 'f1', true, 'u2');
            expect(after.enabled).toBe(true);
            expect(after).toMatchObject({ key: 'f1', currentVersion: 1 });
            const agg = await admin.findOneAdmin('p', 'f1');
            expect(agg).toMatchObject({ enabled: true, currentVersion: 1 });
            const h = await admin.getHistory('p', 'f1');
            expect(h.versions).toHaveLength(1);
        });

        it('no-op when already in requested state', async () => {
            await admin.create(
                {
                    projectKey: 'p',
                    key: 'f2',
                    enabled: true,
                    rules: [],
                },
                'u1',
            );
            const before = await admin.findOneAdmin('p', 'f2');
            const after = await admin.setEnabled('p', 'f2', true, 'u2');
            expect(after.enabled).toBe(true);
            expect(after).toEqual(before);
        });

        it('throws when flag missing', async () => {
            await expect(admin.setEnabled('p', 'missing', true, 'u1')).rejects.toThrow(NotFoundException);
        });
    });

    describe('optimistic concurrency', () => {
        it('rejects a stale concurrent update with ConflictException, keeps the winner intact', async () => {
            await admin.create(
                {
                    projectKey: 'p',
                    key: 'race-key',
                    description: 'v0',
                    enabled: true,
                    rules: [oneFilterCondition('r1', 'x', 'eq', 1)],
                },
                'u1',
            );

            // İki "istemci" flag'i aynı anda okuyup güncelliyor; ikisi de aynı
            // başlangıç durumunu görüyor (aynı updatedAt). Biri kazanmalı, diğeri
            // ConflictException ile reddedilmeli — sessizce ezilmemeli.
            const outcomes = await Promise.allSettled([
                admin.update('p', 'race-key', { rules: [oneFilterCondition('r1', 'x', 'eq', 2)] }, 'client-A'),
                admin.update('p', 'race-key', { rules: [oneFilterCondition('r1', 'x', 'eq', 3)] }, 'client-B'),
            ]);

            const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
            const rejected = outcomes.filter((o) => o.status === 'rejected');
            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            expect(rejected[0].reason).toBeInstanceOf(ConflictException);

            // Kaybeden isteğin verisi sessizce yazılmamış olmalı: kazananın son
            // hali korunmuş olmalı, iki değişikliğin karışımı değil.
            const finalState = await admin.findOneAdmin('p', 'race-key');
            expect(finalState.currentVersion).toBe(2);
        });

        it('preserves full version history across several sequential updates', async () => {
            await admin.create(
                {
                    projectKey: 'p',
                    key: 'hist-key',
                    description: 'v0',
                    enabled: true,
                    rules: [oneFilterCondition('r1', 'x', 'eq', 1)],
                },
                'u1',
            );
            await admin.update('p', 'hist-key', { rules: [oneFilterCondition('r1', 'x', 'eq', 2)] }, 'u2');
            await admin.update('p', 'hist-key', { rules: [oneFilterCondition('r1', 'x', 'eq', 3)] }, 'u3');
            await admin.update('p', 'hist-key', { rules: [oneFilterCondition('r1', 'x', 'eq', 4)] }, 'u4');

            const h = await admin.getHistory('p', 'hist-key');
            expect(h.versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);

            const v1 = await admin.getVersionSnapshot('p', 'hist-key', 1);
            expect(v1.snapshot.rules[0].filters[0].value).toBe(1);
        });
    });

    describe('evaluate', () => {
        it('returns only enabled result per key', async () => {
            await admin.create(
                {
                    projectKey: 'partner-frontend',
                    key: 'show_live_support_chat',
                    enabled: true,
                    rules: [oneFilterCondition('r1', 'accountId', 'eq', '9742948')],
                },
                'u1',
            );

            const out = await runtime.evaluate('partner-frontend', ['show_live_support_chat', 'unknown-flag'], {
                accountId: '9742948',
            });

            expect(out).toEqual({
                results: {
                    show_live_support_chat: { enabled: true },
                    'unknown-flag': { enabled: false },
                },
            });
        });
    });

    describe('evaluateBatch', () => {
        it('evaluates the same flag independently per group context, keyed by group id', async () => {
            await admin.create(
                {
                    projectKey: 'partner-frontend',
                    key: 'show_live_support_chat',
                    enabled: true,
                    rules: [oneFilterCondition('r1', 'accountId', 'eq', '9742948')],
                },
                'u1',
            );

            const out = await runtime.evaluateBatch('partner-frontend', [
                { id: 'row-1', flagKeys: ['show_live_support_chat'], context: { accountId: '9742948' } },
                { id: 'row-2', flagKeys: ['show_live_support_chat'], context: { accountId: 'someone-else' } },
            ]);

            expect(out).toEqual({
                results: {
                    'row-1': { results: { show_live_support_chat: { enabled: true } } },
                    'row-2': { results: { show_live_support_chat: { enabled: false } } },
                },
            });
        });

        it('treats an unknown flag key as disabled within a group, mirroring evaluate()', async () => {
            const out = await runtime.evaluateBatch('partner-frontend', [
                { id: 'row-1', flagKeys: ['unknown-flag'], context: {} },
            ]);

            expect(out).toEqual({
                results: {
                    'row-1': { results: { 'unknown-flag': { enabled: false } } },
                },
            });
        });

        it('defaults to an empty context when a group omits it', async () => {
            await admin.create(
                {
                    projectKey: 'partner-frontend',
                    key: 'always-on',
                    enabled: true,
                    rules: [],
                },
                'u1',
            );

            const out = await runtime.evaluateBatch('partner-frontend', [{ id: 'row-1', flagKeys: ['always-on'] }]);

            expect(out).toEqual({
                results: {
                    'row-1': { results: { 'always-on': { enabled: true } } },
                },
            });
        });

        it('loads the runtime snapshot only once regardless of group count', async () => {
            await admin.create(
                {
                    projectKey: 'partner-frontend',
                    key: 'always-on',
                    enabled: true,
                    rules: [],
                },
                'u1',
            );

            const spy = jest.spyOn(runtimeCache, 'loadOrRebuildSnapshotForEvaluate');

            await runtime.evaluateBatch(
                'partner-frontend',
                Array.from({ length: 50 }, (_, i) => ({ id: `row-${i}`, flagKeys: ['always-on'], context: { id: i } })),
            );

            expect(spy).toHaveBeenCalledTimes(1);
        });
    });
});
