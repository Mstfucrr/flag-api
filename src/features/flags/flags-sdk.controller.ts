import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { EvaluateFlagsBodyDto } from './dto/evaluate-flags-body.dto';
import { EvaluateBatchBodyDto } from './dto/evaluate-batch-body.dto';
import { FlagsService } from './flags.service';
import { FlagsApiKeyGuard } from '../../common/guards/flags-api-key.guard';
import { FiyuuThrottlerGuard } from '../../common/throttling/fiyuu-throttler.guard';
import { ApiRateLimitExceeded } from '../../common/throttling/throttling.swagger';

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
    evaluate(@Param('projectKey') projectKey: string, @Body() body: EvaluateFlagsBodyDto) {
        return this.flagsService.evaluate(projectKey, body.flagKeys, body.context);
    }

    @Post('evaluate-batch')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Evaluate flags for multiple contexts in a single request',
        description:
            'Aynı veya farklı flag anahtarlarını, her biri kendi context’ine sahip birden fazla grup için tek istekte değerlendirir. ' +
            'Tek snapshot yüklemesi paylaşılır; N context için N ayrı /evaluate isteği yerine 1 istek yeterlidir.',
    })
    @ApiParam({ name: 'projectKey' })
    @ApiBody({ type: EvaluateBatchBodyDto })
    evaluateBatch(@Param('projectKey') projectKey: string, @Body() body: EvaluateBatchBodyDto) {
        return this.flagsService.evaluateBatch(projectKey, body.groups);
    }

    @Get(':flagKey')
    @ApiOperation({ summary: 'Get current runtime flag state' })
    @ApiParam({ name: 'projectKey' })
    @ApiParam({ name: 'flagKey' })
    one(@Param('projectKey') projectKey: string, @Param('flagKey') flagKey: string) {
        return this.flagsService.findOne(projectKey, flagKey);
    }

    @Get()
    @ApiOperation({ summary: 'List runtime flags for a project' })
    @ApiParam({ name: 'projectKey' })
    list(@Param('projectKey') projectKey: string) {
        return this.flagsService.findAll(projectKey);
    }
}
