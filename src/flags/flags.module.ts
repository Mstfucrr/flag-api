import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlagEntity } from '../database/entities/flag.entity';
import { CachedFlagsPersistence } from './cached-flags-persistence';
import { FlagsAdminController } from './flags-admin.controller';
import { FlagsSdkController } from './flags-sdk.controller';
import {
  FLAGS_PERSISTENCE,
  FlagsPersistenceRepository,
} from './flags-persistence.repository';
import { FlagsService } from './flags.service';
import { FlagVersionEntity } from '../database/entities/flag-version.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FlagEntity, FlagVersionEntity])],
  controllers: [FlagsSdkController, FlagsAdminController],
  providers: [
    FlagsPersistenceRepository,
    CachedFlagsPersistence,
    { provide: FLAGS_PERSISTENCE, useExisting: CachedFlagsPersistence },
    FlagsService,
  ],
})
export class FlagsModule {}
