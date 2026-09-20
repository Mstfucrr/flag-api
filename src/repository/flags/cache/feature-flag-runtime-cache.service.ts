import { Injectable, Logger } from '@nestjs/common';
import type { FlagConditionRow } from '../../../features/flags/shared/types/flag.types';
import type { FlagAggregate } from '../flags-persistence.repository';
import { FlagsPersistenceRepository } from '../flags-persistence.repository';
import { RedisCacheService } from '../../redis/redis-cache.service';
import { runtimeFlagsKey, runtimeVersionKey } from './feature-flag-runtime-cache.keys';

/** DB satırından değerlendirme için yeterli ince dilim (versiyon / geçmiş yok). */
export interface RuntimeFlagSlice {
    enabled: boolean;
    rules: FlagConditionRow[];
}

/** Projeye özgü aktif bayrakların Redis’te tutulan tek görünümü. */
export interface RuntimeFlagsSnapshot {
    /** ISO zaman — gözlem / hata ayıklama */
    builtAt: string;
    byKey: Record<string, RuntimeFlagSlice>;
}

/**
 * SDK runtime için türetilmiş önbellek: admin verisi burada tutulmaz,
 * yalnızca aktif kuralların özeti.
 */
@Injectable()
export class FeatureFlagRuntimeCacheService {
    private readonly logger = new Logger(FeatureFlagRuntimeCacheService.name);

    /**
     * Proje başına, o an sürmekte olan bir DB rebuild'i varsa Promise'i burada
     * tutar. Cache-miss stampede'i önler: aynı projeye aynı anda gelen N
     * `evaluate` isteği, N ayrı DB sorgusu yerine bu tek Promise'i paylaşır
     * (yalnızca bu pod içinde — pod'lar arası koordinasyon değil).
     */
    private readonly inFlightRebuilds = new Map<string, Promise<RuntimeFlagsSnapshot>>();

    constructor(
        private readonly redisCache: RedisCacheService,
        private readonly flagsRepo: FlagsPersistenceRepository,
    ) {}

    /**
     * Redis’teki evaluate snapshot’ını okur.
     *
     * @remarks
     * `loadOrRebuildSnapshotForEvaluate` önce buraya bakar. Admin okumaları Redis kullanmaz.
     *
     * @param projectKey - Proje anahtarı
     * @returns Snapshot veya miss / Redis kapalıysa `null`
     *
     * @example
     * ```ts
     * await getRuntimeSnapshot('portal')
     * ```
     */
    async getRuntimeSnapshot(projectKey: string): Promise<RuntimeFlagsSnapshot | null> {
        return this.redisCache.getJson<RuntimeFlagsSnapshot>(runtimeFlagsKey(projectKey));
    }

    /**
     * Snapshot’ı Redis’e yazar (TTL yok).
     *
     * @remarks
     * Mutasyon sonrası yenileme ve cache-miss rebuild bu metodu doldurur.
     *
     * @param projectKey - Proje anahtarı
     * @param snapshot - Evaluate dilimi
     *
     * @example
     * ```ts
     * await setRuntimeSnapshot('portal', snapshot)
     * ```
     */
    async setRuntimeSnapshot(projectKey: string, snapshot: RuntimeFlagsSnapshot): Promise<void> {
        await this.redisCache.setJson(runtimeFlagsKey(projectKey), snapshot, 0);
    }

    /**
     * DB’den evaluate dilimini üretir; Redis’e yazmaz.
     *
     * @remarks
     * Cache miss ve admin yazımı sonrası rebuild. Versiyon geçmişi snapshot’a girmez.
     *
     * @param projectKey - Proje anahtarı
     * @returns `{ builtAt, byKey }` — versiyon geçmişi yok
     *
     * @example
     * ```ts
     * await rebuildRuntimeSnapshot('portal')
     * ```
     */
    async rebuildRuntimeSnapshot(projectKey: string): Promise<RuntimeFlagsSnapshot> {
        const rows = await this.flagsRepo.listByProject(projectKey);
        return this.toSnapshot(rows);
    }

    private toSnapshot(rows: FlagAggregate[]): RuntimeFlagsSnapshot {
        const byKey: Record<string, RuntimeFlagSlice> = {};
        for (const agg of rows) {
            byKey[agg.key] = {
                enabled: agg.enabled,
                rules: structuredClone(agg.rules),
            };
        }
        return { builtAt: new Date().toISOString(), byKey };
    }

    /**
     * Cache versiyon sayacını +1 yapar. Redis yoksa sessizce geçer.
     *
     * @remarks
     * `refreshRuntimeCacheAfterMutation` içinde snapshot yazımından sonra çağrılır.
     *
     * @param projectKey - Proje anahtarı
     *
     * @example
     * ```ts
     * await bumpRuntimeVersion('portal')
     * ```
     */
    async bumpRuntimeVersion(projectKey: string): Promise<void> {
        const n = await this.redisCache.incr(runtimeVersionKey(projectKey));
        if (n === null) {
            this.logger.warn(`Runtime sürüm artırılamadı (Redis yok): project=${projectKey}`);
        }
    }

    /**
     * Admin yazımından sonra Redis’i DB ile hizalar. Redis hatası isteği düşürmez.
     *
     * @remarks
     * `create` / `update` / `setEnabled` / `remove` / `rollback` DB kaydından sonra çağırır.
     *
     * @param projectKey - Proje anahtarı
     *
     * @example
     * ```ts
     * await refreshRuntimeCacheAfterMutation('portal')
     * ```
     */
    async refreshRuntimeCacheAfterMutation(projectKey: string): Promise<void> {
        const pk = projectKey.trim();
        try {
            const snap = await this.rebuildRuntimeSnapshot(pk);
            await this.setRuntimeSnapshot(pk, snap);
            await this.bumpRuntimeVersion(pk);
        } catch (err: unknown) {
            this.logger.warn(`Runtime önbellek güncellenemedi (DB başarılı olabilir): project=${pk}`, err);
        }
    }

    /**
     * Evaluate için snapshot getirir; yoksa DB’den kurar.
     *
     * @remarks
     * SDK `evaluate` ve `evaluateBatch` tek giriş noktası. Admin GET burayı kullanmaz.
     *
     * @param projectKey - Proje anahtarı
     * @returns Redis hit veya DB’den üretilmiş snapshot
     *
     * @example
     * ```ts
     * await loadOrRebuildSnapshotForEvaluate('portal')
     * ```
     */
    async loadOrRebuildSnapshotForEvaluate(projectKey: string): Promise<RuntimeFlagsSnapshot> {
        const pk = projectKey.trim();
        const hit = await this.getRuntimeSnapshot(pk);
        if (hit) {
            return hit;
        }

        const existing = this.inFlightRebuilds.get(pk);
        if (existing) {
            return existing;
        }

        const rebuild = this.rebuildAndCacheForEvaluate(pk).finally(() => {
            this.inFlightRebuilds.delete(pk);
        });
        this.inFlightRebuilds.set(pk, rebuild);
        return rebuild;
    }

    private async rebuildAndCacheForEvaluate(pk: string): Promise<RuntimeFlagsSnapshot> {
        const snap = await this.rebuildRuntimeSnapshot(pk);
        try {
            await this.setRuntimeSnapshot(pk, snap);
        } catch (err: unknown) {
            this.logger.warn(`Evaluate snapshot Redis’e yazılamadı, DB sonucu kullanılacak: project=${pk}`, err);
        }
        return snap;
    }

    /**
     * Projenin Redis runtime anahtarlarını siler.
     *
     * @remarks
     * Proje silinirken `purgeProjectFlags` çağırır.
     *
     * @param projectKey - Proje anahtarı
     *
     * @example
     * ```ts
     * await clearProjectRuntime('portal')
     * ```
     */
    async clearProjectRuntime(projectKey: string): Promise<void> {
        const pk = projectKey.trim();
        try {
            await this.redisCache.del(runtimeFlagsKey(pk));
            await this.redisCache.del(runtimeVersionKey(pk));
        } catch (err: unknown) {
            this.logger.warn(`Runtime anahtarları silinemedi: project=${pk}`, err);
        }
    }

    /**
     * Felaket kurtarma: cache’i DB’den yeniden kurar.
     *
     * @remarks
     * Admin `POST …/runtime-cache/refresh` ucu. Normal yazım yolu `refreshRuntimeCacheAfterMutation`.
     *
     * @param projectKey - Proje anahtarı
     * @returns `{ ok: true, snapshot }`
     *
     * @example
     * ```ts
     * await refreshRuntimeCacheManual('portal')
     * ```
     */
    async refreshRuntimeCacheManual(projectKey: string): Promise<{
        ok: boolean;
        snapshot: RuntimeFlagsSnapshot;
    }> {
        const pk = projectKey.trim();
        await this.refreshRuntimeCacheAfterMutation(pk);
        const snapshot = (await this.getRuntimeSnapshot(pk)) ?? (await this.rebuildRuntimeSnapshot(pk));
        return { ok: true, snapshot };
    }
}
