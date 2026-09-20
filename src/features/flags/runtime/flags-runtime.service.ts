import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FLAGS_PERSISTENCE, type IFlagsPersistence } from '../../../repository/flags/flags-persistence.repository';
import { FeatureFlagRuntimeCacheService } from '../../../repository/flags/cache/feature-flag-runtime-cache.service';
import { evaluateRuntimeEnabled, toRuntime } from '../shared/flag-mappers';

/**
 * SDK yüzü: Redis snapshot üzerinden evaluate; DB yalnızca anahtar listesi için.
 *
 * Admin okumaları {@link FlagsAdminService} üzerindedir.
 */
@Injectable()
export class FlagsRuntimeService {
    constructor(
        @Inject(FLAGS_PERSISTENCE) private readonly flags: IFlagsPersistence,
        private readonly runtimeCache: FeatureFlagRuntimeCacheService,
    ) {}

    /**
     * SDK listesi; kuralları gizler.
     *
     * @remarks
     * `GET /projects/:projectKey/flags` (bootstrap). `enabled` burada yok; `evaluate` gerekir.
     *
     * @param projectKey - Proje anahtarı
     * @returns Sadece `{ key }[]`; `enabled` evaluate ile alınır.
     *
     * @example
     * ```ts
     * await findAll('portal')
     * // [{ key: 'new-checkout' }]
     * ```
     */
    async findAll(projectKey: string) {
        const p = projectKey.trim();
        const list = await this.flags.listByProject(p);
        return list.map((a) => toRuntime(a));
    }

    /**
     * Verilen bağlamda flag’lerin açık/kapalı olduğunu hesaplar (SDK ana yolu).
     *
     * @remarks
     * `POST /projects/:projectKey/flags/evaluate`. Redis snapshot; admin CRUD değil.
     *
     * @param projectKey - Proje anahtarı
     * @param flagKeys - Sorgulanacak key listesi
     * @param context - Kural alanları (`plan`, `userId`, …)
     * @returns `{ results: { [flagKey]: { enabled } } }`. Tanımsız veya eşleşmeyen key `enabled: false`.
     *
     * @example
     * ```ts
     * await evaluate('portal', ['new-checkout'], { plan: 'pro' })
     * // { results: { 'new-checkout': { enabled: true } } }
     * ```
     */
    async evaluate(projectKey: string, flagKeys: string[], context: Record<string, unknown> = {}) {
        const p = projectKey.trim();
        const results: Record<string, { enabled: boolean }> = {};
        const snapshot = await this.runtimeCache.loadOrRebuildSnapshotForEvaluate(p);

        for (const rawKey of flagKeys) {
            const key = rawKey.trim();
            if (!key) {
                continue;
            }
            const slice = snapshot.byKey[key];
            results[key] = {
                enabled: slice !== undefined ? evaluateRuntimeEnabled(slice.enabled, slice.rules, context) : false,
            };
        }

        return { results };
    }

    /**
     * Birden fazla context grubunu tek snapshot ile değerlendirir.
     *
     * @remarks
     * SDK aynı tick’te farklı context biriktirince `POST …/evaluate-batch`.
     *
     * @param projectKey - Proje anahtarı
     * @param groups - Her grup: `id`, `flagKeys`, isteğe bağlı `context`
     * @returns `{ results: { [groupId]: { results: { [flagKey]: { enabled } } } } }`
     *
     * @example
     * ```ts
     * await evaluateBatch('portal', [{ id: 'web', flagKeys: ['new-checkout'], context: { plan: 'pro' } }])
     * ```
     */
    async evaluateBatch(
        projectKey: string,
        groups: { id: string; flagKeys: string[]; context?: Record<string, unknown> }[],
    ) {
        const p = projectKey.trim();
        const snapshot = await this.runtimeCache.loadOrRebuildSnapshotForEvaluate(p);
        const results: Record<string, { results: Record<string, { enabled: boolean }> }> = {};

        for (const group of groups) {
            const groupContext = group.context ?? {};
            const groupResults: Record<string, { enabled: boolean }> = {};
            for (const rawKey of group.flagKeys) {
                const key = rawKey.trim();
                if (!key) {
                    continue;
                }
                const slice = snapshot.byKey[key];
                groupResults[key] = {
                    enabled:
                        slice !== undefined
                            ? evaluateRuntimeEnabled(slice.enabled, slice.rules, groupContext)
                            : false,
                };
            }
            results[group.id] = { results: groupResults };
        }

        return { results };
    }

    /**
     * SDK tek flag okuma; yalnızca key döner.
     *
     * @remarks
     * `GET /projects/:projectKey/flags/:flagKey`. Açık/kapalı için `evaluate` kullan.
     *
     * @param projectKey - Proje anahtarı
     * @param key - Flag anahtarı
     * @returns `{ key }`
     * @throws {NotFoundException} Flag yoksa
     *
     * @example
     * ```ts
     * await findOne('portal', 'new-checkout')
     * // { key: 'new-checkout' }
     * ```
     */
    async findOne(projectKey: string, key: string) {
        const agg = await this.flags.findByLookup(projectKey, key);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${key}`);
        }
        return toRuntime(agg);
    }
}
