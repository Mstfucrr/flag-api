import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';

describe('ProjectsService', () => {
  let service: ProjectsService;
  const mockRepo = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByKey: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: ProjectsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get(ProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('createProject uses default environments when omitted', async () => {
    const saved = {
      id: 'uuid-1',
      name: 'Acme',
      key: 'acme',
      environments: ['dev', 'stage', 'prod'],
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
      updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    mockRepo.create.mockResolvedValue(saved);

    const out = await service.createProject({
      name: '  Acme  ',
      key: 'acme',
    });

    expect(mockRepo.create).toHaveBeenCalledWith({
      name: 'Acme',
      key: 'acme',
      environments: ['dev', 'stage', 'prod'],
    });
    expect(out.key).toBe('acme');
    expect(out.environments).toEqual(['dev', 'stage', 'prod']);
  });

  it('createProject propagates ConflictException from repository', async () => {
    mockRepo.create.mockRejectedValue(
      new ConflictException('Project key already exists: dup-key'),
    );

    await expect(
      service.createProject({ name: 'X', key: 'dup-key' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('findAll returns mapped DTOs', async () => {
    mockRepo.findAll.mockResolvedValue([
      {
        id: '1',
        name: 'A',
        key: 'a',
        environments: ['dev'],
        createdAt: new Date('2020-01-01T00:00:00.000Z'),
        updatedAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    ]);

    const list = await service.findAll();
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe('a');
  });
});
