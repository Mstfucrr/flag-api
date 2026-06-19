import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerModuleOptions } from '@nestjs/throttler';
import { FiyuuThrottlerGuard } from './fiyuu-throttler.guard';

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function createThrottlerOptions(
  config: ConfigService,
): ThrottlerModuleOptions {
  return [
    {
      ttl: positiveInt(config.get<string>('THROTTLER_TTL'), 60_000),
      limit: positiveInt(config.get<string>('THROTTLER_LIMIT'), 1_000),
    },
  ];
}

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createThrottlerOptions,
    }),
  ],
  providers: [FiyuuThrottlerGuard],
  exports: [FiyuuThrottlerGuard],
})
export class ThrottlingModule {}
