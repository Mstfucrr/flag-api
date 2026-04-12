import { Module } from '@nestjs/common';
import { FlagsSdkController } from './flags-sdk.controller';
import { FlagsService } from './flags.service';

@Module({
  controllers: [FlagsSdkController],
  providers: [FlagsService],
})
export class FlagsModule {}
