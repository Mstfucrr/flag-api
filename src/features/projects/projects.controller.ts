import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
    ApiCreatedResponse,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { ProjectsAdminGuard } from './guards/projects-admin.guard';
import { ProjectsService } from './projects.service';
import { FiyuuThrottlerGuard } from '../../common/throttling/fiyuu-throttler.guard';
import { ApiRateLimitExceeded } from '../../common/throttling/throttling.swagger';

/**
 * Admin API for managing client applications (projects).
 * Not used by the feature-flag SDK runtime.
 */
@ApiTags('projects-admin')
@ApiRateLimitExceeded()
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@Controller('admin/projects')
@UseGuards(ProjectsAdminGuard, FiyuuThrottlerGuard)
export class ProjectsController {
    constructor(private readonly projectsService: ProjectsService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: 'Create project (admin)',
        description:
            'Registers a client application (portal, partner app, mobile, etc.). Requires authentication in production.',
    })
    @ApiCreatedResponse({ type: ProjectResponseDto })
    async create(
        @Body() dto: CreateProjectDto,
        @Headers('x-principal-id') xPrincipalId?: string,
    ): Promise<ProjectResponseDto> {
        const principalId = xPrincipalId?.trim() || 'system';
        return this.projectsService.createProject(dto, principalId);
    }

    @Get()
    @ApiOperation({
        summary: 'List projects (admin)',
        description: 'Returns all registered projects ordered by creation time.',
    })
    @ApiOkResponse({ type: ProjectResponseDto, isArray: true })
    async findAll(): Promise<ProjectResponseDto[]> {
        return this.projectsService.findAll();
    }

    @Delete(':projectKey')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: 'Delete project (admin)',
        description: 'Deletes the project and all flags under it. Requires authentication in production.',
    })
    @ApiParam({
        name: 'projectKey',
        description: 'Project key (URL-encoded if needed)',
    })
    @ApiNoContentResponse({ description: 'Project deleted' })
    async remove(
        @Param('projectKey') projectKey: string,
        @Headers('x-principal-id') xPrincipalId?: string,
    ): Promise<void> {
        const principalId = xPrincipalId?.trim() || 'system';
        await this.projectsService.removeProject(projectKey, principalId);
    }
}
