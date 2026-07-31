import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from '../../repository/redis/redis-cache.module';
import { FlagEntity } from '../../database/entities/flag.entity';
import { FlagVersionEntity } from '../../database/entities/flag-version.entity';
import { RequestLogModule } from '../request-log/request-log.module';
import { FeatureFlagRuntimeCacheService } from '../../repository/flags/cache/feature-flag-runtime-cache.service';
import { FlagsAdminController } from './flags-admin.controller';
import { FlagsSdkController } from './flags-sdk.controller';
import { FlagsApiKeyGuard } from '../../common/guards/flags-api-key.guard';
import { FLAGS_PERSISTENCE, FlagsPersistenceRepository } from '../../repository/flags/flags-persistence.repository';
import { FlagsService } from './flags.service';

@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forFeature([FlagEntity, FlagVersionEntity]),
        RequestLogModule,
        RedisCacheModule,
    ],
    controllers: [FlagsSdkController, FlagsAdminController],
    providers: [
        FlagsApiKeyGuard,
        FlagsPersistenceRepository,
        { provide: FLAGS_PERSISTENCE, useExisting: FlagsPersistenceRepository },
        FeatureFlagRuntimeCacheService,
        FlagsService,
    ],
    exports: [FlagsService],
})
export class FlagsModule {}
