import { Module } from '@nestjs/common';
import { FlagsAdminController } from './flags-admin.controller';
import { FlagsSdkController } from './flags-sdk.controller';
import { FlagsService } from './flags.service';

@Module({
  controllers: [FlagsSdkController, FlagsAdminController],
  providers: [FlagsService],
})
export class FlagsModule {}
