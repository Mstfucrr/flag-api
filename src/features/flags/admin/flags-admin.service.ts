import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import {
    FLAGS_PERSISTENCE,
    type FlagAggregate,
    type IFlagsPersistence,
} from '../../../repository/flags/flags-persistence.repository';
import { RequestLogService } from '../../../repository/request-log/request-log.service';
import { canonicalRulesJson, diffChangedFields, freshTimestamp, projectFlagsResourceId } from '../shared/flags.utils';
import { FeatureFlagRuntimeCacheService } from '../../../repository/flags/cache/feature-flag-runtime-cache.service';
import { writeAuditLog } from '../../../common/logging/audit.log';
import { buildSnapshot, deepCloneSnapshot, toAdminCurrent } from '../shared/flag-mappers';

/**
 * Admin yüzü: oluşturma, güncelleme, silme, versiyon geçmişi, rollback.
 * Kalıcılık {@link IFlagsPersistence} üzerinden; denetim izi {@link RequestLogService} ile yazılır.
 *
 * Admin okumaları doğrudan DB’den; Redis yalnızca mutasyon sonrası snapshot yenilemesi içindir.
 * SDK evaluate {@link FlagsRuntimeService} üzerindedir.
 */
@Injectable()
export class FlagsAdminService {
    private readonly logger = new Logger(FlagsAdminService.name);

    constructor(
        @Inject(FLAGS_PERSISTENCE) private readonly flags: IFlagsPersistence,
        private readonly requestLog: RequestLogService,
        private readonly runtimeCache: FeatureFlagRuntimeCacheService,
    ) {}

    /**
     * Yeni flag oluşturur (v1); Redis ve audit güncellenir.
     *
     * @remarks
     * Admin `POST /admin/projects/:projectKey/flags`. SDK bu metodu çağırmaz.
     *
     * @param dto - Proje, key, enabled, rules
     * @param principalId - İşlemi yapan (audit)
     * @returns Admin görünümü (kurallar + currentVersion)
     * @throws {ConflictException} Aynı proje+key zaten varsa
     *
     * @example
     * ```ts
     * await create({ projectKey: 'portal', key: 'new-checkout', enabled: true, rules: [] }, 'ali')
     * ```
     */
    async create(dto: CreateFlagDto, principalId: string) {
        const projectKey = dto.projectKey.trim();
        const key = dto.key.trim();
        if (await this.flags.existsByProjectAndFlagKey(projectKey, key)) {
            throw new ConflictException(`Flag already exists in project ${projectKey}: ${key}`);
        }
        const now = freshTimestamp();
        const rules = dto.rules !== undefined ? dto.rules : [];
        const snapshot = buildSnapshot({
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
                    snapshot: deepCloneSnapshot(snapshot),
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
        return toAdminCurrent(aggregate);
    }

    /**
     * Admin listesi; kurallar ve versiyon no dahildir, snapshot geçmişi yoktur.
     *
     * @remarks
     * `GET /admin/projects/:projectKey/flags`. DB’den okur, Redis kullanmaz.
     *
     * @param projectKey - Proje anahtarı
     * @returns Tam güncel flag kayıtları
     *
     * @example
     * ```ts
     * await findAllAdmin('portal')
     * // [{ key: 'new-checkout', enabled: true, currentVersion: 1, ... }]
     * ```
     */
    async findAllAdmin(projectKey: string) {
        const p = projectKey.trim();
        const list = await this.flags.listByProject(p);
        return list.map((a) => toAdminCurrent(a));
    }

    /**
     * Projedeki tüm flag’leri DB ve Redis’ten siler (proje silinirken).
     *
     * @remarks
     * `ProjectsService.removeProject` çağırır; ayrı HTTP ucu yok.
     *
     * @param projectKey - Proje anahtarı
     * @returns Silinen flag key listesi; yoksa `[]`
     *
     * @example
     * ```ts
     * await purgeProjectFlags('portal')
     * // ['new-checkout', 'chat']
     * ```
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
     * Redis snapshot’ı DB’den elle yeniden kurar.
     *
     * @remarks
     * Admin `POST …/runtime-cache/refresh` (Redis felaketi sonrası).
     *
     * @param projectKey - Proje anahtarı
     * @returns `{ ok: true, snapshot }` — evaluate dilimi
     *
     * @example
     * ```ts
     * await refreshRuntimeCacheManual('portal')
     * ```
     */
    async refreshRuntimeCacheManual(projectKey: string) {
        return this.runtimeCache.refreshRuntimeCacheManual(projectKey.trim());
    }

    /**
     * Admin tek flag okuma; kurallar ve versiyon dahildir.
     *
     * @remarks
     * `GET /admin/projects/:projectKey/flags/:flagKey`. DB, Redis değil.
     *
     * @param projectKey - Proje anahtarı
     * @param key - Flag anahtarı
     * @returns Güncel admin kaydı (rules + currentVersion)
     * @throws {NotFoundException} Flag yoksa
     *
     * @example
     * ```ts
     * await findOneAdmin('portal', 'new-checkout')
     * ```
     */
    async findOneAdmin(projectKey: string, key: string) {
        const agg = await this.flags.findByLookup(projectKey, key);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${key}`);
        }
        return toAdminCurrent(agg);
    }

    /**
     * Sadece aç/kapa; versiyon artırmaz.
     *
     * @remarks
     * Admin `PATCH …/flags/:flagKey/enabled`.
     *
     * @param projectKey - Proje anahtarı
     * @param flagKey - Flag anahtarı
     * @param enabled - Yeni master durum
     * @param principalId - İşlemi yapan (audit)
     * @returns Güncel admin kaydı
     * @throws {NotFoundException} Flag yoksa
     *
     * @example
     * ```ts
     * await setEnabled('portal', 'new-checkout', false, 'ali')
     * ```
     */
    async setEnabled(projectKey: string, flagKey: string, enabled: boolean, principalId: string) {
        const pk = projectKey.trim();
        const fk = flagKey.trim();
        const agg = await this.flags.findByLookup(pk, fk);
        if (!agg) {
            throw new NotFoundException(`Flag not found: ${fk}`);
        }
        if (agg.enabled === enabled) {
            return toAdminCurrent(agg);
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
        return toAdminCurrent(refreshed);
    }

    /**
     * Flag günceller. Kural değişirse yeni versiyon; değilse sadece metadata.
     *
     * @remarks
     * Admin `PUT …/flags/:flagKey`.
     *
     * @param projectKey - Proje anahtarı
     * @param routeKey - Flag anahtarı
     * @param dto - description / enabled / rules
     * @param principalId - İşlemi yapan (audit)
     * @returns Güncel admin kaydı
     * @throws {NotFoundException} Flag yoksa
     *
     * @example
     * ```ts
     * await update('portal', 'new-checkout', { description: 'Yeni checkout' }, 'ali')
     * ```
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
            return toAdminCurrent(refreshed);
        }

        if (!rulesChanged && !descChanged && !enabledChanged) {
            return toAdminCurrent(agg);
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
        const snapshot = buildSnapshot({
            key: next.key,
            description: next.description,
            enabled: next.enabled,
            rules: next.rules,
        });
        next.versions.push({
            version: next.currentVersion,
            snapshot: deepCloneSnapshot(snapshot),
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
        return toAdminCurrent(next);
    }

    /**
     * Belirli bir versiyonun o anki kopyasını getirir.
     *
     * @remarks
     * Admin `GET …/flags/:flagKey/versions/:version`.
     *
     * @param projectKey - Proje anahtarı
     * @param key - Flag anahtarı
     * @param version - Versiyon numarası
     * @returns Snapshot + createdAt / createdBy
     * @throws {NotFoundException} Flag veya versiyon yoksa
     *
     * @example
     * ```ts
     * await getVersionSnapshot('portal', 'new-checkout', 1)
     * ```
     */
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
            snapshot: deepCloneSnapshot(entry.snapshot),
        };
    }

    /**
     * Flag versiyon geçmişini getirir (yeniden eskiye).
     *
     * @remarks
     * Admin `GET …/flags/:flagKey/history`.
     *
     * @param projectKey - Proje anahtarı
     * @param key - Flag anahtarı
     * @returns `{ flagKey, versions[] }`
     * @throws {NotFoundException} Flag yoksa
     *
     * @example
     * ```ts
     * await getHistory('portal', 'new-checkout')
     * // { flagKey: 'new-checkout', versions: [v2, v1] }
     * ```
     */
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

    /**
     * Flag’i siler; Redis ve audit güncellenir.
     *
     * @remarks
     * Admin `DELETE …/flags/:flagKey`.
     *
     * @param projectKey - Proje anahtarı
     * @param key - Flag anahtarı
     * @param principalId - İşlemi yapan (audit)
     * @throws {NotFoundException} Flag yoksa
     *
     * @example
     * ```ts
     * await remove('portal', 'new-checkout', 'ali')
     * ```
     */
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
     * Eski içeriği geri yükler; versiyon numarası yine artar.
     *
     * @remarks
     * Admin `POST …/flags/:flagKey/rollback/:version`.
     *
     * @param projectKey - Proje anahtarı
     * @param routeKey - Flag anahtarı
     * @param targetVersion - Geri yüklenen versiyon
     * @param principalId - İşlemi yapan (audit)
     * @returns Yeni `currentVersion`’lı admin kaydı (içerik eski, numara yeni)
     * @throws {NotFoundException} Flag yoksa
     * @throws {BadRequestException} Hedef versiyon yoksa
     *
     * @example
     * ```ts
     * await rollback('portal', 'new-checkout', 1, 'ali')
     * // currentVersion 3, içerik v1
     * ```
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
        const newSnapshot = buildSnapshot({
            key: merged.key,
            description: merged.description,
            enabled: merged.enabled,
            rules: merged.rules,
        });
        merged.versions.push({
            version: merged.currentVersion,
            snapshot: deepCloneSnapshot(newSnapshot),
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
        return toAdminCurrent(merged);
    }
}
