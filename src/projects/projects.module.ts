import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlagsModule } from '../flags/flags.module';
import { RequestLogModule } from '../request-log/request-log.module';
import { ProjectEntity } from '../database/entities/project.entity';
import { ProjectSeedService } from './project-seed.service';
import { ProjectsAdminGuard } from './guards/projects-admin.guard';
import { ProjectsController } from './projects.controller';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity]),
    RequestLogModule,
    FlagsModule,
  ],
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
