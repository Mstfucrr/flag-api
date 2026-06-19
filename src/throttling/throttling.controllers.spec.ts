import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { FlagsAdminController } from '../flags/flags-admin.controller';
import { FlagsSdkController } from '../flags/flags-sdk.controller';
import { HealthController } from '../health/health.controller';
import { ProjectsController } from '../projects/projects.controller';
import { RequestLogController } from '../request-log/request-log.controller';
import { FiyuuThrottlerGuard } from './fiyuu-throttler.guard';

describe('controller throttling metadata', () => {
  it.each([
    FlagsSdkController,
    FlagsAdminController,
    ProjectsController,
    RequestLogController,
  ])('%p uses FiyuuThrottlerGuard', (controller) => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      controller,
    ) as unknown[];
    expect(guards).toContain(FiyuuThrottlerGuard);
  });

  it.each([FlagsAdminController, ProjectsController, RequestLogController])(
    '%p overrides the admin limit to 300/60s',
    (controller) => {
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, controller)).toBe(
        300,
      );
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, controller)).toBe(
        60_000,
      );
    },
  );

  it('keeps health endpoints outside throttling', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, HealthController),
    ).toBeUndefined();
  });
});
