import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FLAGS_PERSISTENCE } from './flags-persistence.repository';
import { FlagsService } from './flags.service';
import { MemoryFlagsPersistence } from './memory-flags-persistence';

describe('FlagsService', () => {
  let service: FlagsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlagsService,
        { provide: FLAGS_PERSISTENCE, useClass: MemoryFlagsPersistence },
      ],
    }).compile();

    service = module.get<FlagsService>(FlagsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('visibility', () => {
    it('runtime list exposes only evaluation-safe fields', async () => {
      await service.create(
        {
          projectKey: 'proj-safe',
          key: 'chat',
          enabled: true,
          rules: [
            {
              id: 'r1',
              field: 'accountId',
              operator: 'eq',
              value: '123',
              active: true,
            },
          ],
        },
        'u1',
      );

      const [row] = await service.findAll('proj-safe');
      expect(row).toEqual({
        key: 'chat',
      });
      expect(row).not.toHaveProperty('versions');
      expect(row).not.toHaveProperty('currentVersion');
      expect(row).not.toHaveProperty('updatedAt');
      expect(row).not.toHaveProperty('description');
    });

    it('admin list exposes current metadata but not version snapshots by default', async () => {
      await service.create(
        {
          projectKey: 'proj-admin',
          key: 'chat',
          description: 'desc',
          enabled: true,
          rules: [],
        },
        'u1',
      );

      const [row] = await service.findAllAdmin('proj-admin');
      expect(row).toMatchObject({
        projectKey: 'proj-admin',
        key: 'chat',
        description: 'desc',
        enabled: true,
        currentVersion: 1,
      });
      expect(row).not.toHaveProperty('versions');
    });
  });

  describe('getHistory', () => {
    it('returns versions with createdBy, no audit payload', async () => {
      await service.create(
        {
          projectKey: 'p',
          key: 'f1',
          enabled: true,
          rules: [],
        },
        'alice',
      );
      const h = await service.getHistory('p', 'f1');
      expect(h.flagKey).toBe('f1');
      expect(h).not.toHaveProperty('audit');
      expect(h.versions).toHaveLength(1);
      expect(h.versions[0]).toMatchObject({
        version: 1,
        createdBy: 'alice',
      });
    });
  });

  describe('update', () => {
    it('bumps version and keeps flag key immutable', async () => {
      await service.create(
        {
          projectKey: 'p',
          key: 'immutable-key',
          description: 'v1',
          enabled: true,
          rules: [],
        },
        'u1',
      );
      const after = await service.update(
        'p',
        'immutable-key',
        { description: 'v2' },
        'u2',
      );
      expect(after.key).toBe('immutable-key');
      expect(after.description).toBe('v2');
      expect(after.currentVersion).toBe(2);
    });
  });

  describe('rollback', () => {
    it('restores snapshot fields but keeps aggregate key', async () => {
      await service.create(
        {
          projectKey: 'p',
          key: 'roll-key',
          description: 'a',
          enabled: true,
          rules: [
            {
              id: 'r1',
              field: 'x',
              operator: 'eq',
              value: 1,
              active: true,
            },
          ],
        },
        'u1',
      );
      await service.update(
        'p',
        'roll-key',
        { description: 'b', rules: [] },
        'u2',
      );
      const rolled = await service.rollback('p', 'roll-key', 1, 'u3');
      expect(rolled.key).toBe('roll-key');
      expect(rolled.description).toBe('a');
      expect(rolled.rules).toHaveLength(1);
      expect(rolled.currentVersion).toBe(3);
    });
  });

  describe('setEnabled', () => {
    it('toggles enabled and bumps version', async () => {
      await service.create(
        {
          projectKey: 'p',
          key: 'f1',
          enabled: false,
          rules: [],
        },
        'u1',
      );
      const after = await service.setEnabled('p', 'f1', true, 'u2');
      expect(after.enabled).toBe(true);
      expect(after).toMatchObject({ key: 'f1' });
      const agg = await service.findOneAdmin('p', 'f1');
      expect(agg).toMatchObject({ enabled: true });
      const snap = await service.getVersionSnapshot('p', 'f1', 2);
      expect(snap.createdBy).toBe('u2');
    });

    it('no-op when already in requested state', async () => {
      await service.create(
        {
          projectKey: 'p',
          key: 'f2',
          enabled: true,
          rules: [],
        },
        'u1',
      );
      const before = await service.findOneAdmin('p', 'f2');
      const after = await service.setEnabled('p', 'f2', true, 'u2');
      expect(after.enabled).toBe(true);
      expect(after).toEqual(before);
    });

    it('throws when flag missing', async () => {
      await expect(
        service.setEnabled('p', 'missing', true, 'u1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('evaluate', () => {
    it('returns only enabled result per key', async () => {
      await service.create(
        {
          projectKey: 'partner-frontend',
          key: 'show_live_support_chat',
          enabled: true,
          rules: [
            {
              id: 'r1',
              field: 'accountId',
              operator: 'eq',
              value: '9742948',
              active: true,
            },
          ],
        },
        'u1',
      );

      const out = await service.evaluate(
        'partner-frontend',
        ['show_live_support_chat', 'unknown-flag'],
        { accountId: '9742948' },
      );

      expect(out).toEqual({
        results: {
          show_live_support_chat: { enabled: true },
          'unknown-flag': { enabled: false },
        },
      });
    });
  });
});
