import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateFlagBodyDto } from './dto/create-flag-body.dto';
import { CreateFlagDto } from './dto/create-flag.dto';
import { RollbackFlagDto } from './dto/rollback-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import { VendorLogsQueryDto } from './dto/vendor-logs-query.dto';
import { FlagsService } from './flags.service';

/**
 * Project-scoped flags API — used by portal admin UI and `@core-sdk/feature-flags-sdk` (GETs).
 */
@ApiTags('flags')
@Controller('projects/:projectKey/flags')
export class FlagsSdkController {
  constructor(private readonly flagsService: FlagsService) {}

  @Post('audit/query')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Paged audit log (vendor-logs compatible response)',
    description:
      'POST body matches portal vendor-logs: resourceId, descending, delta, cursor. Response: { items, prev, next }.',
  })
  @ApiBody({ type: VendorLogsQueryDto })
  @ApiParam({
    name: 'projectKey',
    description: 'Ignored for routing; included for URL consistency',
  })
  queryAudit(
    @Param('projectKey') _projectKey: string,
    @Body() dto: VendorLogsQueryDto,
  ) {
    void _projectKey;
    return this.flagsService.queryVendorLogs(dto);
  }

  @Post(':flagKey/rollback/:version')
  @ApiOperation({
    summary: 'Rollback to a previous version (creates a new version)',
  })
  @ApiParam({ name: 'projectKey' })
  @ApiParam({ name: 'flagKey' })
  @ApiParam({ name: 'version', type: Number })
  @ApiBody({ type: RollbackFlagDto })
  rollback(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: RollbackFlagDto,
    @Headers('x-principal-id') xPrincipalId?: string,
  ) {
    const principalId = xPrincipalId?.trim() || 'system';
    return this.flagsService.rollback(
      projectKey,
      flagKey,
      version,
      dto,
      principalId,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a flag' })
  @ApiBody({ type: CreateFlagBodyDto })
  @ApiParam({ name: 'projectKey' })
  create(
    @Param('projectKey') projectKey: string,
    @Body() body: CreateFlagBodyDto,
    @Headers('x-principal-id') xPrincipalId?: string,
  ) {
    const principalId = xPrincipalId?.trim() || 'system';
    const dto: CreateFlagDto = {
      projectKey: projectKey.trim(),
      key: body.key,
      description: body.description,
      enabled: body.enabled,
      rules: body.rules,
      summaryNote: body.summaryNote,
    };
    return this.flagsService.create(dto, principalId);
  }

  @Get(':flagKey/history')
  @ApiOperation({ summary: 'Audit log and version snapshots for a flag' })
  @ApiParam({ name: 'projectKey' })
  @ApiParam({ name: 'flagKey' })
  history(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
  ) {
    return this.flagsService.getHistory(projectKey, flagKey);
  }

  @Get(':flagKey/versions/:version')
  @ApiOperation({ summary: 'Version snapshot' })
  @ApiParam({ name: 'projectKey' })
  @ApiParam({ name: 'flagKey' })
  @ApiParam({ name: 'version', type: Number })
  version(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.flagsService.getVersionSnapshot(projectKey, flagKey, version);
  }

  @Put(':flagKey')
  @ApiOperation({ summary: 'Update flag (creates new version)' })
  @ApiParam({ name: 'projectKey' })
  @ApiParam({ name: 'flagKey' })
  @ApiBody({ type: UpdateFlagDto })
  update(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
    @Body() dto: UpdateFlagDto,
    @Headers('x-principal-id') xPrincipalId?: string,
  ) {
    const principalId = xPrincipalId?.trim() || 'system';
    return this.flagsService.update(projectKey, flagKey, dto, principalId);
  }

  @Delete(':flagKey')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete flag' })
  @ApiParam({ name: 'projectKey' })
  @ApiParam({ name: 'flagKey' })
  @ApiResponse({ status: 204, description: 'Flag deleted' })
  remove(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
  ) {
    this.flagsService.remove(projectKey, flagKey);
  }

  @Get(':flagKey')
  @ApiOperation({ summary: 'Get current flag state' })
  @ApiParam({ name: 'projectKey' })
  @ApiParam({ name: 'flagKey' })
  one(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
  ) {
    return this.flagsService.findOne(projectKey, flagKey);
  }

  @Get()
  @ApiOperation({ summary: 'List flags for a project' })
  @ApiParam({ name: 'projectKey' })
  list(@Param('projectKey') projectKey: string) {
    return this.flagsService.findAll(projectKey);
  }
}
