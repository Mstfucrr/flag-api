import { Injectable, Logger } from '@nestjs/common';
import type { FlagConditionRow } from '../types/flag.types';
import type { FlagAggregate } from '../flags-persistence.repository';
import { FlagsPersistenceRepository } from '../flags-persistence.repository';
import { RedisCacheService } from '../../cache/redis-cache.service';
import {
  runtimeEvaluatePattern,
  runtimeFlagsKey,
  runtimeVersionKey,
} from './feature-flag-runtime-cache.keys';

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

  constructor(
    private readonly redisCache: RedisCacheService,
    private readonly flagsRepo: FlagsPersistenceRepository,
  ) {}

  /** Redis’teki anlık görüntü (yoksa null). */
  async getRuntimeSnapshot(
    projectKey: string,
  ): Promise<RuntimeFlagsSnapshot | null> {
    return this.redisCache.getJson<RuntimeFlagsSnapshot>(
      runtimeFlagsKey(projectKey),
    );
  }

  async setRuntimeSnapshot(
    projectKey: string,
    snapshot: RuntimeFlagsSnapshot,
  ): Promise<void> {
    await this.redisCache.setJson(runtimeFlagsKey(projectKey), snapshot, 0);
  }

  /** DB’den projeyi okuyup ince snapshot üretir (Redis yazmaz). */
  async rebuildRuntimeSnapshot(
    projectKey: string,
  ): Promise<RuntimeFlagsSnapshot> {
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

  /** Mutasyon sonrası sürüm sayacı (+1). Redis kapalıysa sessizce atlanır. */
  async bumpRuntimeVersion(projectKey: string): Promise<void> {
    const n = await this.redisCache.incr(runtimeVersionKey(projectKey));
    if (n === null) {
      this.logger.warn(
        `Runtime sürüm artırılamadı (Redis yok): project=${projectKey}`,
      );
    }
  }

  /** İsteğe bağlı evaluate önbelleğini temizler (şimdilik anahtar yazılmıyor). */
  async invalidateEvaluationCache(projectKey: string): Promise<void> {
    await this.redisCache.delByPattern(runtimeEvaluatePattern(projectKey));
  }

  /**
   * Admin yazma işleminden sonra: DB kaydı tamam → snapshot yenile → sürüm artır → evaluate deseni sil.
   * Redis hatası üretimi bozmaz; sadece loglanır.
   */
  async refreshRuntimeCacheAfterMutation(projectKey: string): Promise<void> {
    const pk = projectKey.trim();
    try {
      const snap = await this.rebuildRuntimeSnapshot(pk);
      await this.setRuntimeSnapshot(pk, snap);
      await this.bumpRuntimeVersion(pk);
      await this.invalidateEvaluationCache(pk);
    } catch (err: unknown) {
      this.logger.warn(
        `Runtime önbellek güncellenemedi (DB başarılı olabilir): project=${pk}`,
        err,
      );
    }
  }

  /**
   * Evaluate için: önce Redis; cache miss → DB’den üret ve Redis’e yaz (sürüm artışı yok).
   */
  async loadOrRebuildSnapshotForEvaluate(
    projectKey: string,
  ): Promise<RuntimeFlagsSnapshot> {
    const pk = projectKey.trim();
    const hit = await this.getRuntimeSnapshot(pk);
    if (hit) {
      return hit;
    }
    const snap = await this.rebuildRuntimeSnapshot(pk);
    try {
      await this.setRuntimeSnapshot(pk, snap);
    } catch (err: unknown) {
      this.logger.warn(
        `Evaluate snapshot Redis’e yazılamadı, DB sonucu kullanılacak: project=${pk}`,
        err,
      );
    }
    return snap;
  }

  /** Proje silindiğinde veya tüm bayraklar silindiğinde runtime anahtarlarını kaldırır. */
  async clearProjectRuntime(projectKey: string): Promise<void> {
    const pk = projectKey.trim();
    try {
      await this.redisCache.del(runtimeFlagsKey(pk));
      await this.redisCache.del(runtimeVersionKey(pk));
      await this.invalidateEvaluationCache(pk);
    } catch (err: unknown) {
      this.logger.warn(`Runtime anahtarları silinemedi: project=${pk}`, err);
    }
  }

  /**
   * Elle iyileştirme: mutasyon sonrası ile aynı yenileme akışı (DB → Redis → sürüm + evaluate temizliği).
   */
  async refreshRuntimeCacheManual(projectKey: string): Promise<{
    ok: boolean;
    snapshot: RuntimeFlagsSnapshot;
  }> {
    const pk = projectKey.trim();
    await this.refreshRuntimeCacheAfterMutation(pk);
    const snapshot =
      (await this.getRuntimeSnapshot(pk)) ??
      (await this.rebuildRuntimeSnapshot(pk));
    return { ok: true, snapshot };
  }
}
