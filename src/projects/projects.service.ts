import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FlagsService } from '../flags/flags.service';
import { RequestLogService } from '../request-log/request-log.service';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  ProjectResponseDto,
  mapProjectToResponse,
} from './dto/project-response.dto';
import { ProjectsRepository } from './projects.repository';
import { writeAuditLog } from '../common/logging/audit.log';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly requestLog: RequestLogService,
    private readonly flagsService: FlagsService,
  ) {}

  async createProject(
    dto: CreateProjectDto,
    principalId: string,
  ): Promise<ProjectResponseDto> {
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

  async findAll(): Promise<ProjectResponseDto[]> {
    const rows = await this.projectsRepository.findAll();
    return rows.map(mapProjectToResponse);
  }

  async findByKey(key: string): Promise<ProjectResponseDto | null> {
    const row = await this.projectsRepository.findByKey(key);
    return row ? mapProjectToResponse(row) : null;
  }

  async removeProject(projectKey: string, principalId: string): Promise<void> {
    const k = projectKey.trim();
    const existing = await this.projectsRepository.findByKey(k);
    if (!existing) {
      throw new NotFoundException(`Project not found: ${k}`);
    }
    const removedFlagKeys = await this.flagsService.purgeProjectFlags(k);
    await this.projectsRepository.deleteByKey(k);
    this.logger.log(
      `Project deleted: key=${k} removedFlags=${removedFlagKeys.length}`,
    );
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
