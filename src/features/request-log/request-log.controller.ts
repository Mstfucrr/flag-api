import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { QueryRequestLogsDto } from './dto/query-request-logs.dto';
import { RequestLogService } from '../../repository/request-log/request-log.service';
import { FiyuuThrottlerGuard } from '../../common/throttling/fiyuu-throttler.guard';
import { ApiRateLimitExceeded } from '../../common/throttling/throttling.swagger';

@ApiTags('request-logs')
@ApiRateLimitExceeded()
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@Controller('admin/request-logs')
@UseGuards(FiyuuThrottlerGuard)
export class RequestLogController {
    constructor(private readonly requestLogService: RequestLogService) {}

    @Post('query')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Query request audit logs (cursor pagination)' })
    @ApiBody({ type: QueryRequestLogsDto })
    @ApiOkResponse({
        description: 'Paginated log items with optional prev/next cursors',
    })
    async query(@Body() dto: QueryRequestLogsDto) {
        return this.requestLogService.query(dto);
    }
}
