import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlagEntity } from '../database/entities/flag.entity';
import { FlagsAdminController } from './flags-admin.controller';
import { FlagsSdkController } from './flags-sdk.controller';
import {
  FLAGS_PERSISTENCE,
  FlagsPersistenceRepository,
} from './flags-persistence.repository';
import { FlagsService } from './flags.service';

@Module({
  imports: [TypeOrmModule.forFeature([FlagEntity])],
  controllers: [FlagsSdkController, FlagsAdminController],
  providers: [
    FlagsPersistenceRepository,
    { provide: FLAGS_PERSISTENCE, useExisting: FlagsPersistenceRepository },
    FlagsService,
  ],
})
export class FlagsModule {}
