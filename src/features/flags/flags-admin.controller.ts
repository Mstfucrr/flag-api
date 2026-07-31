import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Put,
    UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateFlagBodyDto } from './dto/create-flag-body.dto';
import { CreateFlagDto } from './dto/create-flag.dto';
import { SetFlagEnabledBodyDto } from './dto/set-flag-enabled-body.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import { FlagsService } from './flags.service';
import { FlagsApiKeyGuard } from '../../common/guards/flags-api-key.guard';
import { FiyuuThrottlerGuard } from '../../common/throttling/fiyuu-throttler.guard';
import { ApiRateLimitExceeded } from '../../common/throttling/throttling.swagger';

@ApiTags('flags-admin')
@ApiRateLimitExceeded()
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@UseGuards(FlagsApiKeyGuard, FiyuuThrottlerGuard)
@Controller('admin/projects/:projectKey/flags')
export class FlagsAdminController {
    constructor(private readonly flagsService: FlagsService) {}

    /** Redis runtime önbelleğini DB ile yeniden hizalar (felaket kurtarma). */
    @Post('runtime-cache/refresh')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Rebuild Redis runtime snapshot from database',
        description: 'Updates ff:runtime:flags:* and bumps ff:runtime:version; clears optional evaluate pattern.',
    })
    @ApiParam({ name: 'projectKey' })
    refreshRuntimeCache(@Param('projectKey') projectKey: string) {
        return this.flagsService.refreshRuntimeCacheManual(projectKey);
    }

    @Post(':flagKey/rollback/:version')
    @ApiOperation({
        summary: 'Rollback to a previous version (creates a new version)',
    })
    @ApiParam({ name: 'projectKey' })
    @ApiParam({ name: 'flagKey' })
    @ApiParam({ name: 'version', type: Number })
    rollback(
        @Param('projectKey') projectKey: string,
        @Param('flagKey') flagKey: string,
        @Param('version', ParseIntPipe) version: number,
        @Headers('x-principal-id') xPrincipalId?: string,
    ) {
        const principalId = xPrincipalId?.trim() || 'system';
        return this.flagsService.rollback(projectKey, flagKey, version, principalId);
    }

    @Post()
    @ApiOperation({ summary: 'Create a flag (admin)' })
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
        };
        return this.flagsService.create(dto, principalId);
    }

    @Get(':flagKey/history')
    @ApiOperation({
        summary: 'Version snapshots for a flag (admin)',
    })
    @ApiParam({ name: 'projectKey' })
    @ApiParam({ name: 'flagKey' })
    history(@Param('projectKey') projectKey: string, @Param('flagKey') flagKey: string) {
        return this.flagsService.getHistory(projectKey, flagKey);
    }

    @Get(':flagKey/versions/:version')
    @ApiOperation({ summary: 'Version snapshot (admin)' })
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

    @Patch(':flagKey/enabled')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Set flag enabled/disabled only (admin)',
    })
    @ApiParam({ name: 'projectKey' })
    @ApiParam({ name: 'flagKey' })
    @ApiBody({ type: SetFlagEnabledBodyDto })
    setEnabled(
        @Param('projectKey') projectKey: string,
        @Param('flagKey') flagKey: string,
        @Body() body: SetFlagEnabledBodyDto,
        @Headers('x-principal-id') xPrincipalId?: string,
    ) {
        const principalId = xPrincipalId?.trim() || 'system';
        return this.flagsService.setEnabled(projectKey, flagKey, body.enabled, principalId);
    }

    @Put(':flagKey')
    @ApiOperation({ summary: 'Update flag (admin)' })
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
    @ApiOperation({ summary: 'Delete flag (admin)' })
    @ApiParam({ name: 'projectKey' })
    @ApiParam({ name: 'flagKey' })
    @ApiResponse({ status: 204, description: 'Flag deleted' })
    async remove(
        @Param('projectKey') projectKey: string,
        @Param('flagKey') flagKey: string,
        @Headers('x-principal-id') xPrincipalId?: string,
    ) {
        const principalId = xPrincipalId?.trim() || 'system';
        await this.flagsService.remove(projectKey, flagKey, principalId);
    }

    @Get(':flagKey')
    @ApiOperation({ summary: 'Get current flag state for admin UI' })
    @ApiParam({ name: 'projectKey' })
    @ApiParam({ name: 'flagKey' })
    one(@Param('projectKey') projectKey: string, @Param('flagKey') flagKey: string) {
        return this.flagsService.findOneAdmin(projectKey, flagKey);
    }

    @Get()
    @ApiOperation({ summary: 'List current flags for admin UI' })
    @ApiParam({ name: 'projectKey' })
    list(@Param('projectKey') projectKey: string) {
        return this.flagsService.findAllAdmin(projectKey);
    }
}
