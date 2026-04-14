import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  describe('setEnabled', () => {
    it('toggles enabled and bumps version', () => {
      service.create(
        {
          projectKey: 'p',
          key: 'f1',
          enabled: false,
          rules: [],
        },
        'u1',
      );
      const after = service.setEnabled('p', 'f1', true, 'u2');
      expect(after.enabled).toBe(true);
      expect(after).toMatchObject({ key: 'f1' });
      const agg = service.findOne('p', 'f1');
      expect(agg).toMatchObject({ enabled: true });
    });

    it('no-op when already in requested state', () => {
      service.create(
        {
          projectKey: 'p',
          key: 'f2',
          enabled: true,
          rules: [],
        },
        'u1',
      );
      const before = service.findOne('p', 'f2');
      const after = service.setEnabled('p', 'f2', true, 'u2');
      expect(after.enabled).toBe(true);
      expect(after).toEqual(before);
    });

    it('throws when flag missing', () => {
      expect(() => service.setEnabled('p', 'missing', true, 'u1')).toThrow(
        NotFoundException,
      );
    });
  });
});
