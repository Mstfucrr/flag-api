import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthService, ReadinessResult } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Readiness özeti' })
  @ApiOkResponse({ description: 'Servis trafiğe hazır veya degraded durumda.' })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL kullanılamıyor.' })
  async check(): Promise<ReadinessResult> {
    return this.ready();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'PostgreSQL ve Redis readiness probe' })
  @ApiOkResponse({ description: 'Servis trafiğe hazır veya degraded durumda.' })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL kullanılamıyor.' })
  async ready(): Promise<ReadinessResult> {
    const result = await this.health.readiness();
    if (result.status === 'error') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
