import { Module } from '@nestjs/common';
import { ProjectSeedService } from './project-seed.service';
import { ProjectsAdminGuard } from './guards/projects-admin.guard';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsRepository,
    ProjectsService,
    ProjectSeedService,
    ProjectsAdminGuard,
  ],
  exports: [ProjectsService, ProjectsRepository],
})
export class ProjectsModule {}
