import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FEATURE_FLAGS_AUDIT_RESOURCE_LOGS } from './constants/audit-resource.constants';
import { FlagsService } from './flags.service';

describe('FlagsService', () => {
  let service: FlagsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FlagsService],
    }).compile();

    service = module.get<FlagsService>(FlagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('queryVendorLogs', () => {
    it('returns vendor-shaped page for allowed resourceId', () => {
      service.create(
        {
          projectKey: 'proj-a',
          key: 'a',
          enabled: true,
          rules: [],
        },
        'u1',
      );
      const out = service.queryVendorLogs({
        resourceId: FEATURE_FLAGS_AUDIT_RESOURCE_LOGS,
        descending: true,
        delta: 10,
      });
      expect(out.items.length).toBe(1);
      expect(out.items[0]).toMatchObject({
        code: 'ok',
        principalId: 'u1',
        action: 'create-flag',
      });
      expect(out.next).toBeNull();
      expect(out.prev).toBeNull();
    });

    it('rejects unknown resourceId', () => {
      expect(() =>
        service.queryVendorLogs({
          resourceId: '/unknown-audit',
          delta: 10,
        }),
      ).toThrow(BadRequestException);
    });
  });
});
