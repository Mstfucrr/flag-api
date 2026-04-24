import { Test, TestingModule } from '@nestjs/testing';
import { RequestLogService } from '../request-log/request-log.service';
import { FLAGS_PERSISTENCE } from './flags-persistence.repository';
import { FlagsSdkController } from './flags-sdk.controller';
import { FlagsService } from './flags.service';
import { MemoryFlagsPersistence } from './memory-flags-persistence';

describe('FlagsSdkController', () => {
  let controller: FlagsSdkController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlagsSdkController],
      providers: [
        FlagsService,
        { provide: FLAGS_PERSISTENCE, useClass: MemoryFlagsPersistence },
        { provide: RequestLogService, useValue: { append: jest.fn() } },
      ],
    }).compile();

    controller = module.get<FlagsSdkController>(FlagsSdkController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
