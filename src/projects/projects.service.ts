import { Injectable, Logger } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  ProjectResponseDto,
  mapProjectToResponse,
} from './dto/project-response.dto';
import { ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly projectsRepository: ProjectsRepository) {}

  async createProject(dto: CreateProjectDto): Promise<ProjectResponseDto> {
    const key = dto.key.trim();
    const entity = await this.projectsRepository.create({
      name: dto.name.trim(),
      key,
    });
    this.logger.log(`Project created: key=${key} name=${entity.name}`);
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
