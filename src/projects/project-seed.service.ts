import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';

/**
 * Ensures a default `portal` project exists in development only.
 */
@Injectable()
export class ProjectSeedService implements OnModuleInit {
  private readonly logger = new Logger(ProjectSeedService.name);

  constructor(
    private readonly projectsRepository: ProjectsRepository,
    private readonly projectsService: ProjectsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }
    try {
      const existing = await this.projectsRepository.findByKey('portal');
      if (existing) {
        return;
      }
      await this.projectsService.createProject(
        {
          name: 'Portal',
          key: 'portal',
        },
        'system',
      );
      this.logger.log('Seeded default project: portal');
    } catch (e) {
      this.logger.warn(
        `Portal seed skipped (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }
}
