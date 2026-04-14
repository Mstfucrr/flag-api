import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FlagsService } from './flags.service';

/**
 * Project-scoped runtime flags API — used by `@core-sdk/feature-flags-sdk`.
 */
@ApiTags('flags')
@Controller('projects/:projectKey/flags')
export class FlagsSdkController {
  constructor(private readonly flagsService: FlagsService) {}

  @Get(':flagKey')
  @ApiOperation({ summary: 'Get current runtime flag state' })
  @ApiParam({ name: 'projectKey' })
  @ApiParam({ name: 'flagKey' })
  one(
    @Param('projectKey') projectKey: string,
    @Param('flagKey') flagKey: string,
  ) {
    return this.flagsService.findOne(projectKey, flagKey);
  }

  @Get()
  @ApiOperation({ summary: 'List runtime flags for a project' })
  @ApiParam({ name: 'projectKey' })
  list(@Param('projectKey') projectKey: string) {
    return this.flagsService.findAll(projectKey);
  }
}
