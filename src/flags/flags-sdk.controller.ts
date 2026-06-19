import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { EvaluateFlagsBodyDto } from './dto/evaluate-flags-body.dto';
import { FlagsService } from './flags.service';
import { FlagsApiKeyGuard } from './guards/flags-api-key.guard';
import { FiyuuThrottlerGuard } from '../throttling/fiyuu-throttler.guard';
import { ApiRateLimitExceeded } from '../throttling/throttling.swagger';

/**
 * Project-scoped runtime flags API — used by `@core-sdk/feature-flags-sdk`.
 */
@ApiTags('flags')
@ApiRateLimitExceeded()
@UseGuards(FlagsApiKeyGuard, FiyuuThrottlerGuard)
@Controller('projects/:projectKey/flags')
export class FlagsSdkController {
  constructor(private readonly flagsService: FlagsService) {}

  @Post('evaluate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Evaluate one or more flags for a context' })
  @ApiParam({ name: 'projectKey' })
  @ApiBody({ type: EvaluateFlagsBodyDto })
  evaluate(
    @Param('projectKey') projectKey: string,
    @Body() body: EvaluateFlagsBodyDto,
  ) {
    return this.flagsService.evaluate(projectKey, body.flagKeys, body.context);
  }

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
