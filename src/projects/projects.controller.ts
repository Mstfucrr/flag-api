import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { ProjectsService } from './projects.service';

// TODO: @UseGuards(JwtAuthGuard) — project routes are admin-only; wire when auth exists.

/**
 * Admin API for managing client applications (projects).
 * Not used by the feature-flag SDK runtime.
 */
@ApiTags('projects')
@Controller('projects')
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
  async create(@Body() dto: CreateProjectDto): Promise<ProjectResponseDto> {
    return this.projectsService.createProject(dto);
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
}
