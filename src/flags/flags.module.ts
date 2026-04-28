import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from '../cache/redis-cache.module';
import { FlagEntity } from '../database/entities/flag.entity';
import { FlagVersionEntity } from '../database/entities/flag-version.entity';
import { RequestLogModule } from '../request-log/request-log.module';
import { FeatureFlagRuntimeCacheService } from './cache/feature-flag-runtime-cache.service';
import { FlagsAdminController } from './flags-admin.controller';
import { FlagsSdkController } from './flags-sdk.controller';
import {
  FLAGS_PERSISTENCE,
  FlagsPersistenceRepository,
} from './flags-persistence.repository';
import { FlagsService } from './flags.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FlagEntity, FlagVersionEntity]),
    RequestLogModule,
    RedisCacheModule,
  ],
  controllers: [FlagsSdkController, FlagsAdminController],
  providers: [
    FlagsPersistenceRepository,
    { provide: FLAGS_PERSISTENCE, useExisting: FlagsPersistenceRepository },
    FeatureFlagRuntimeCacheService,
    FlagsService,
  ],
  exports: [FlagsService],
})
export class FlagsModule {}
