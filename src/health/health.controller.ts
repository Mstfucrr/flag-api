import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthResult, HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Servis, PostgreSQL ve Redis durum özeti' })
  @ApiOkResponse({ description: 'Servis trafiğe hazır veya degraded durumda.' })
  @ApiServiceUnavailableResponse({ description: 'PostgreSQL kullanılamıyor.' })
  async check(): Promise<HealthResult> {
    const result = await this.health.check();
    if (result.status === 'error') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
