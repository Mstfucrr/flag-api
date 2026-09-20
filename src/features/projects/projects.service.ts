import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FlagsAdminService } from '../flags/admin/flags-admin.service';
import { RequestLogService } from '../../repository/request-log/request-log.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto, mapProjectToResponse } from './dto/project-response.dto';
import { ProjectsRepository } from '../../repository/projects/projects.repository';
import { writeAuditLog } from '../../common/logging/audit.log';

@Injectable()
export class ProjectsService {
    private readonly logger = new Logger(ProjectsService.name);

    constructor(
        private readonly projectsRepository: ProjectsRepository,
        private readonly requestLog: RequestLogService,
        private readonly flagsAdmin: FlagsAdminService,
    ) {}

    /**
     * Yeni proje kaydı oluşturur; audit yazar.
     *
     * @remarks
     * Admin `POST /admin/projects`. SDK bu ucu kullanmaz.
     *
     * @param dto - name, key
     * @param principalId - İşlemi yapan (audit)
     * @returns Oluşturulan proje
     * @throws {ConflictException} Key zaten varsa
     *
     * @example
     * ```ts
     * await createProject({ name: 'Portal', key: 'portal' }, 'ali')
     * ```
     */
    async createProject(dto: CreateProjectDto, principalId: string): Promise<ProjectResponseDto> {
        const key = dto.key.trim();
        const entity = await this.projectsRepository.create({
            name: dto.name.trim(),
            key,
        });
        this.logger.log(`Project created: key=${key} name=${entity.name}`);
        await this.requestLog.append({
            resourceId: '/feature-flags/projects',
            principalId,
            action: 'create-project',
            request: { key: entity.key, name: entity.name },
        });
        writeAuditLog({
            event_action: 'resource.created',
            event_category: 'configuration',
            event_outcome: 'success',
            resource_id: entity.key,
            user_id: principalId,
        });
        return mapProjectToResponse(entity);
    }

    /**
     * Tüm projeleri listeler.
     *
     * @remarks
     * Admin `GET /admin/projects`.
     *
     * @returns Oluşturulma sırasıyla proje listesi
     *
     * @example
     * ```ts
     * await findAll()
     * // [{ key: 'portal', name: 'Portal' }]
     * ```
     */
    async findAll(): Promise<ProjectResponseDto[]> {
        const rows = await this.projectsRepository.findAll();
        return rows.map(mapProjectToResponse);
    }

    /**
     * Key ile tek proje okur.
     *
     * @remarks
     * İç kullanım (seed); controller’da liste/silme var, tek GET yok.
     *
     * @param key - Proje anahtarı
     * @returns Proje DTO’su veya yoksa `null`
     *
     * @example
     * ```ts
     * await findByKey('portal')
     * // { key: 'portal', name: 'Portal' }
     * ```
     */
    async findByKey(key: string): Promise<ProjectResponseDto | null> {
        const row = await this.projectsRepository.findByKey(key);
        return row ? mapProjectToResponse(row) : null;
    }

    /**
     * Projeyi ve altındaki tüm flag’leri siler.
     *
     * @remarks
     * Admin `DELETE /admin/projects/:projectKey`; önce `purgeProjectFlags`.
     *
     * @param projectKey - Proje anahtarı
     * @param principalId - İşlemi yapan (audit)
     * @throws {NotFoundException} Proje yoksa
     *
     * @example
     * ```ts
     * await removeProject('portal', 'ali')
     * ```
     */
    async removeProject(projectKey: string, principalId: string): Promise<void> {
        const k = projectKey.trim();
        const existing = await this.projectsRepository.findByKey(k);
        if (!existing) {
            throw new NotFoundException(`Project not found: ${k}`);
        }
        const removedFlagKeys = await this.flagsAdmin.purgeProjectFlags(k);
        await this.projectsRepository.deleteByKey(k);
        this.logger.log(`Project deleted: key=${k} removedFlags=${removedFlagKeys.length}`);
        await this.requestLog.append({
            resourceId: '/feature-flags/projects',
            principalId,
            action: 'delete-project',
            request: { key: k, removedFlagKeys },
        });
        writeAuditLog({
            event_action: 'resource.deleted',
            event_category: 'configuration',
            event_outcome: 'success',
            resource_id: k,
            user_id: principalId,
        });
    }
}
