import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { FlagConditionRow } from './types/flag.types';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import type { FlagSnapshotModel } from '../../repository/flags/models/flag-snapshot.model';
import {
    FLAGS_PERSISTENCE,
    type FlagAggregate,
    type IFlagsPersistence,
} from '../../repository/flags/flags-persistence.repository';
import { evaluateFlag } from '@core-sdk/feature-flags-core';
import { RequestLogService } from '../../repository/request-log/request-log.service';
import { canonicalRulesJson, diffChangedFields, freshTimestamp, projectFlagsResourceId } from './flags.service.utils';
import { FeatureFlagRuntimeCacheService } from '../../repository/flags/cache/feature-flag-runtime-cache.service';
import { writeAuditLog } from '../../common/logging/audit.log';

/**
 * Feature flag yaşam döngüsü: oluşturma, okuma, güncelleme, silme, versiyon geçmişi,
 * rollback ve runtime değerlendirme. Kalıcılık {@link IFlagsPersistence} üzerinden;
 * denetim izi {@link RequestLogService} ile yazılır.
 *
 * Admin okumaları doğrudan DB’den; Redis yalnızca SDK evaluate için aktif snapshot önbelleğidir.
 */
@Injectable()
export class FlagsService {
    private readonly logger = new Logger(FlagsService.name);

    constructor(
        @Inject(FLAGS_PERSISTENCE) private readonly flags: IFlagsPersistence,
        private readonly requestLog: RequestLogService,
        private readonly runtimeCache: FeatureFlagRuntimeCacheService,
    ) {}

    /** Yeni flag kaydı (v1); çakışan proje+key varsa {@link ConflictException}. */
    async create(dto: CreateFlagDto, principalId: string) {
        const projectKey = dto.projectKey.trim();
        const key = dto.key.trim();
        if (await this.flags.existsByProjectAndFlagKey(projectKey, key)) {
            throw new ConflictException(`Flag already exists in project ${projectKey}: ${key}`);
        }
        const now = freshTimestamp();
        const rules = dto.rules !== undefined ? dto.rules : [];
        const snapshot = this.buildSnapshot({
            key,
            description: dto.description ?? '',
            enabled: dto.enabled,
            rules,
        });
        const aggregate: FlagAggregate = {
            projectKey,
            key,
            description: dto.description ?? '',
            enabled: dto.enabled,
            rules,
            currentVersion: 1,
            updatedAt: now,
            versions: [
                {
                    version: 1,
                    snapshot: this.deepCloneSnapshot(snapshot),
                    createdAt: now,
                    createdBy: principalId,
                },
            ],
        };
        await this.flags.insert(aggregate);
        await this.runtimeCache.refreshRuntimeCacheAfterMutation(projectKey);
        this.logger.log(`Flag created: project=${projectKey} key=${key} v=1`);
        await this.requestLog.append({
            resourceId: projectFlagsResourceId(projectKey),
            principalId,
            action: 'create-flag',
            request: {
                flagKey: key,
                version: aggregate.currentVersion,
                description: aggregate.description,
                enabled: aggregate.enabled,
                rules: aggregate.rules,
            },
        });
        writeAuditLog({
            event_action: 'resource.created',
            event_category: 'configuration',
            event_outcome: 'success',
            resource_id: `${projectKey}:${key}`,
            user_id: principalId,
        });
        return this.toAdminCurrent(aggregate);
    }

    /** SDK / hafif liste: projedeki flag’lerin sadece `key` bilgisi. */
    async findAll(projectKey: string) {
        const p = projectKey.trim();
        const list = await this.flags.listByProject(p);
        return list.map((a) => this.toRuntime(a));
    }

    /** Admin: projedeki tüm flag’lerin tam konfigürasyonu. */
    async findAllAdmin(projectKey: string) {
        const p = projectKey.trim();
        const list = await this.flags.listByProject(p);
        return list.map((a) => this.toAdminCurrent(a));
    }

    /**
     * Projeye ait tüm flag kayıtlarını siler (DB + önbellek).
     * Request log yazmaz.
     */
    async purgeProjectFlags(projectKey: string): Promise<string[]> {
        const pk = projectKey.trim();
        const list = await this.flags.listByProject(pk);
        const keys = list.map((a) => a.key);
        for (const fk of keys) {
            if (await this.flags.existsByProjectAndFlagKey(pk, fk)) {
                await this.flags.delete(pk, fk);
            }
        }
        await this.runtimeCache.clearProjectRuntime(pk);
        this.logger.log(`Purged flags for project=${pk} count=${keys.length} keys=${keys.join(',')}`);
        return keys;
    }

    /**
     * Manuel: DB’den runtime Redis önbelleğini yeniden kurar (Redis arızası sonrası iyileştirme).
     */
    async refreshRuntimeCacheManual(projectKey: string) {
        return this.runtimeCache.refreshRuntimeCacheManual(projectKey.trim());
    }

    /**
     * Verilen bağlamda birden fazla flag için `enabled` sonucu üretir
     * (`@core-sdk/feature-flags-core` `evaluateFlag`).
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
                enabled: slice !== undefined ? this.evaluateRuntimeEnabled(slice.enabled, slice.rules, context) : false,
            };
        }

        return { results };
    }

    /** Tek flag, runtime şekli (yalnızca key). */
    async findOne(projectKey: string, key: string) {
        const agg = await this.flags.findByLookup(projectKey, key);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${key}`);
        }
        return this.toRuntime(agg);
    }

    /** Tek flag, admin şekli (kurallar + versiyon). */
    async findOneAdmin(projectKey: string, key: string) {
        const agg = await this.flags.findByLookup(projectKey, key);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${key}`);
        }
        return this.toAdminCurrent(agg);
    }

    /** Sadece `enabled` alanını günceller; değişiklik yoksa mevcut aggregate döner. */
    async setEnabled(projectKey: string, flagKey: string, enabled: boolean, principalId: string) {
        const pk = projectKey.trim();
        const fk = flagKey.trim();
        const agg = await this.flags.findByLookup(pk, fk);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${fk}`);
        }
        if (agg.enabled === enabled) {
            return this.toAdminCurrent(agg);
        }
        await this.flags.patchMetadata(pk, fk, { enabled }, agg.updatedAt);
        const refreshed = await this.flags.findByLookup(pk, fk);
        if (!refreshed) {
            throw new NotFoundException(`Flag not found: ${fk}`);
        }
        await this.requestLog.append({
            resourceId: projectFlagsResourceId(pk),
            principalId,
            action: 'update-flag-metadata',
            request: {
                flagKey: fk,
                version: refreshed.currentVersion,
                oldData: { enabled: agg.enabled },
                newData: { enabled: refreshed.enabled },
            },
        });
        await this.runtimeCache.refreshRuntimeCacheAfterMutation(pk);
        writeAuditLog({
            event_action: 'resource.updated',
            event_category: 'configuration',
            event_outcome: 'success',
            resource_id: `${pk}:${fk}`,
            user_id: principalId,
        });
        return this.toAdminCurrent(refreshed);
    }

    /**
     * Tam güncelleme: kurallar / açıklama / master `enabled`.
     * Kurallar değişmediyse sadece metadata patch + log; kurallar değiştiyse yeni versiyon.
     */
    async update(projectKey: string, routeKey: string, dto: UpdateFlagDto, principalId: string) {
        const pk = projectKey.trim();
        const agg = await this.flags.findByLookup(pk, routeKey);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${routeKey}`);
        }

        const rulesChanged = dto.rules !== undefined && canonicalRulesJson(dto.rules) !== canonicalRulesJson(agg.rules);
        const descChanged = dto.description !== undefined && dto.description !== agg.description;
        const enabledChanged = dto.enabled !== undefined && dto.enabled !== agg.enabled;

        if (!rulesChanged && (descChanged || enabledChanged)) {
            await this.flags.patchMetadata(
                pk,
                routeKey,
                {
                    ...(dto.description !== undefined ? { description: dto.description } : {}),
                    ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
                },
                agg.updatedAt,
            );
            const refreshed = await this.flags.findByLookup(pk, routeKey);
            if (!refreshed) {
                throw new NotFoundException(`Flag not found: ${routeKey}`);
            }
            const oldData: Record<string, unknown> = {};
            const newData: Record<string, unknown> = {};
            if (enabledChanged) {
                oldData.enabled = agg.enabled;
                newData.enabled = refreshed.enabled;
            }
            if (descChanged) {
                oldData.description = agg.description;
                newData.description = refreshed.description;
            }
            await this.requestLog.append({
                resourceId: projectFlagsResourceId(pk),
                principalId,
                action: 'update-flag-metadata',
                request: {
                    flagKey: routeKey,
                    version: refreshed.currentVersion,
                    oldData,
                    newData,
                },
            });
            await this.runtimeCache.refreshRuntimeCacheAfterMutation(pk);
            writeAuditLog({
                event_action: 'resource.updated',
                event_category: 'configuration',
                event_outcome: 'success',
                resource_id: `${pk}:${routeKey}`,
                user_id: principalId,
            });
            return this.toAdminCurrent(refreshed);
        }

        if (!rulesChanged && !descChanged && !enabledChanged) {
            return this.toAdminCurrent(agg);
        }

        const rules = dto.rules !== undefined ? dto.rules : agg.rules;
        const next: FlagAggregate = {
            ...agg,
            projectKey: pk,
            key: agg.key,
            description: dto.description !== undefined ? dto.description : agg.description,
            enabled: dto.enabled !== undefined ? dto.enabled : agg.enabled,
            rules,
            currentVersion: agg.currentVersion + 1,
            updatedAt: freshTimestamp(),
            versions: [...agg.versions],
        };
        const snapshot = this.buildSnapshot({
            key: next.key,
            description: next.description,
            enabled: next.enabled,
            rules: next.rules,
        });
        next.versions.push({
            version: next.currentVersion,
            snapshot: this.deepCloneSnapshot(snapshot),
            createdAt: next.updatedAt,
            createdBy: principalId,
        });
        await this.flags.updateByLookup(next, routeKey, agg.updatedAt);
        this.logger.log(`Flag updated: project=${pk} key=${next.key} v=${next.currentVersion}`);
        const beforeSnap = {
            description: agg.description,
            enabled: agg.enabled,
            rules: agg.rules,
            version: agg.currentVersion,
        };
        const afterSnap = {
            description: next.description,
            enabled: next.enabled,
            rules: next.rules,
            version: next.currentVersion,
        };
        const { oldData, newData } = diffChangedFields(
            ['description', 'enabled', 'rules', 'version'],
            beforeSnap,
            afterSnap,
        );
        await this.requestLog.append({
            resourceId: projectFlagsResourceId(pk),
            principalId,
            action: 'update-flag',
            request: {
                flagKey: routeKey,
                oldData,
                newData,
            },
        });
        await this.runtimeCache.refreshRuntimeCacheAfterMutation(pk);
        writeAuditLog({
            event_action: 'resource.updated',
            event_category: 'configuration',
            event_outcome: 'success',
            resource_id: `${pk}:${next.key}`,
            user_id: principalId,
        });
        return this.toAdminCurrent(next);
    }

    /** Belirli versiyonun immutable snapshot’ı (geçmiş görüntüleme). */
    async getVersionSnapshot(projectKey: string, key: string, version: number) {
        const agg = await this.flags.findByLookup(projectKey, key);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${key}`);
        }
        const entry = agg.versions.find((v) => v.version === version);
        if (!entry) {
            throw new NotFoundException(`Version not found: ${version}`);
        }
        return {
            version: entry.version,
            createdAt: entry.createdAt,
            createdBy: entry.createdBy ?? '',
            snapshot: this.deepCloneSnapshot(entry.snapshot),
        };
    }

    /** Versiyon listesi (yeniden eskiye sıralı). */
    async getHistory(projectKey: string, key: string) {
        const agg = await this.flags.findByLookup(projectKey, key);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${key}`);
        }
        const fk = agg.key;
        return {
            flagKey: fk,
            versions: [...agg.versions].sort((a, b) => b.version - a.version),
        };
    }

    /** Flag’i kalıcıdan kaldırır ve silme logu yazar. */
    async remove(projectKey: string, key: string, principalId: string) {
        const pk = projectKey.trim();
        const fk = key.trim();
        if (!(await this.flags.existsByProjectAndFlagKey(pk, fk))) {
            throw new NotFoundException(`Flag not found: ${key}`);
        }
        await this.flags.delete(pk, fk);
        await this.runtimeCache.refreshRuntimeCacheAfterMutation(pk);
        this.logger.log(`Flag deleted: project=${pk} key=${fk}`);
        await this.requestLog.append({
            resourceId: projectFlagsResourceId(pk),
            principalId,
            action: 'delete-flag',
            request: { flagKey: fk },
        });
        writeAuditLog({
            event_action: 'resource.deleted',
            event_category: 'configuration',
            event_outcome: 'success',
            resource_id: `${pk}:${fk}`,
            user_id: principalId,
        });
    }

    /**
     * Hedef versiyonun snapshot’ını mevcut üzerine uygular; yeni bir versiyon numarası üretir
     * (içerik eski sürüme döner, versiyon sayacı ilerler).
     */
    async rollback(projectKey: string, routeKey: string, targetVersion: number, principalId: string) {
        const pk = projectKey.trim();
        const agg = await this.flags.findByLookup(pk, routeKey);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${routeKey}`);
        }
        const entry = agg.versions.find((v) => v.version === targetVersion);
        if (!entry) {
            throw new BadRequestException(`Version not found: ${targetVersion}`);
        }
        const snap = entry.snapshot;
        const now = freshTimestamp();
        const merged: FlagAggregate = {
            ...agg,
            projectKey: pk,
            key: agg.key,
            description: snap.description,
            enabled: snap.enabled,
            rules: snap.rules,
            currentVersion: agg.currentVersion + 1,
            updatedAt: now,
            versions: [...agg.versions],
        };
        const newSnapshot = this.buildSnapshot({
            key: merged.key,
            description: merged.description,
            enabled: merged.enabled,
            rules: merged.rules,
        });
        merged.versions.push({
            version: merged.currentVersion,
            snapshot: this.deepCloneSnapshot(newSnapshot),
            createdAt: now,
            createdBy: principalId,
        });
        await this.flags.updateByLookup(merged, routeKey, agg.updatedAt);
        this.logger.log(
            `Flag rollback: project=${pk} key=${merged.key} restoredFrom=v${targetVersion} newVersion=v${merged.currentVersion}`,
        );
        await this.requestLog.append({
            resourceId: projectFlagsResourceId(pk),
            principalId,
            action: 'rollback-flag',
            request: {
                flagKey: routeKey,
                restoredFromVersion: targetVersion,
                newVersion: merged.currentVersion,
            },
        });
        await this.runtimeCache.refreshRuntimeCacheAfterMutation(pk);
        writeAuditLog({
            event_action: 'resource.rollback',
            event_category: 'configuration',
            event_outcome: 'success',
            resource_id: `${pk}:${merged.key}`,
            user_id: principalId,
        });
        return this.toAdminCurrent(merged);
    }

    /** Versiyon dizisine yazılacak anlık immutable görüntü. */
    private buildSnapshot(p: {
        key: string;
        description: string;
        enabled: boolean;
        rules: FlagConditionRow[];
    }): FlagSnapshotModel {
        return {
            key: p.key,
            description: p.description,
            enabled: p.enabled,
            rules: structuredClone(p.rules),
        };
    }

    /** Snapshot’ı serileştirme / dışarı sızdırmayı önlemek için derin kopya. */
    private deepCloneSnapshot(s: FlagSnapshotModel): FlagSnapshotModel {
        return structuredClone(s);
    }

    /**
     * SDK / public GET yanıtı: yalnızca `key`.
     * Gerçek `enabled` değeri POST …/evaluate + bağlam ile alınır.
     */
    private toRuntime(agg: FlagAggregate) {
        return {
            key: agg.key,
        };
    }

    /** Admin API: proje, kurallar, güncel versiyon ve zaman damgası. */
    private toAdminCurrent(agg: FlagAggregate) {
        return {
            projectKey: agg.projectKey,
            key: agg.key,
            description: agg.description,
            enabled: agg.enabled,
            rules: structuredClone(agg.rules),
            currentVersion: agg.currentVersion,
            updatedAt: agg.updatedAt,
        };
    }

    /**
     * Kalıcı kuralları SDK’nın `evaluateFlag` biçimine sarar;
     * master `enabled` kapalıysa veya hiçbir koşul eşleşmezse false döner.
     */
    private evaluateRuntimeEnabled(
        masterEnabled: boolean,
        rules: FlagConditionRow[],
        context: Record<string, unknown>,
    ): boolean {
        return evaluateFlag(
            {
                enabled: masterEnabled,
                rules,
            },
            context,
        ).enabled;
    }
}
