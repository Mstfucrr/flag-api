import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from '../../repository/redis/redis-cache.module';
import { FlagEntity } from '../../database/entities/flag.entity';
import { FlagVersionEntity } from '../../database/entities/flag-version.entity';
import { RequestLogModule } from '../request-log/request-log.module';
import { FeatureFlagRuntimeCacheService } from '../../repository/flags/cache/feature-flag-runtime-cache.service';
import { FlagsAdminController } from './admin/flags-admin.controller';
import { FlagsAdminService } from './admin/flags-admin.service';
import { FlagsSdkController } from './runtime/flags-sdk.controller';
import { FlagsRuntimeService } from './runtime/flags-runtime.service';
import { FlagsApiKeyGuard } from '../../common/guards/flags-api-key.guard';
import { FLAGS_PERSISTENCE, FlagsPersistenceRepository } from '../../repository/flags/flags-persistence.repository';

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
        FlagsRuntimeService,
        FlagsAdminService,
    ],
    exports: [FlagsAdminService],
})
export class FlagsModule {}
