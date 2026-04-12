import { Injectable } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  ProjectResponseDto,
  mapProjectToResponse,
} from './dto/project-response.dto';
import { ProjectsRepository } from './projects.repository';

const DEFAULT_ENVIRONMENTS = ['dev', 'stage', 'prod'] as const;

@Injectable()
export class ProjectsService {
  constructor(private readonly projectsRepository: ProjectsRepository) {}

  async createProject(dto: CreateProjectDto): Promise<ProjectResponseDto> {
    const environments =
      dto.environments != null && dto.environments.length > 0
        ? [...dto.environments]
        : [...DEFAULT_ENVIRONMENTS];
    const entity = await this.projectsRepository.create({
      name: dto.name.trim(),
      key: dto.key.trim(),
      environments,
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
}
