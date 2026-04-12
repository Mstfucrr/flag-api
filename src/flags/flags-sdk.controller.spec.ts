import { Test, TestingModule } from '@nestjs/testing';
import { FlagsSdkController } from './flags-sdk.controller';
import { FlagsService } from './flags.service';

describe('FlagsSdkController', () => {
  let controller: FlagsSdkController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlagsSdkController],
      providers: [FlagsService],
    }).compile();

    controller = module.get<FlagsSdkController>(FlagsSdkController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
