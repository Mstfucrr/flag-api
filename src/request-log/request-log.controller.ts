import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryRequestLogsDto } from './dto/query-request-logs.dto';
import { RequestLogService } from './request-log.service';

@ApiTags('request-logs')
@Controller('admin/request-logs')
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
