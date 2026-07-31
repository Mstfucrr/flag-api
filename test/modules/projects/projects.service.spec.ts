import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FlagsService } from '../../../src/features/flags/flags.service';
import { RequestLogService } from '../../../src/repository/request-log/request-log.service';
import { ProjectsService } from '../../../src/features/projects/projects.service';
import { ProjectsRepository } from '../../../src/repository/projects/projects.repository';

describe('ProjectsService', () => {
    let service: ProjectsService;
    const mockRepo = {
        create: jest.fn(),
        findAll: jest.fn(),
        findByKey: jest.fn(),
        deleteByKey: jest.fn(),
    };
    const mockRequestLog = { append: jest.fn().mockResolvedValue(undefined) };
    const mockFlagsService = {
        purgeProjectFlags: jest.fn().mockResolvedValue([]),
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectsService,
                { provide: ProjectsRepository, useValue: mockRepo },
                { provide: RequestLogService, useValue: mockRequestLog },
                { provide: FlagsService, useValue: mockFlagsService },
            ],
        }).compile();

        service = module.get(ProjectsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('createProject trims name and key', async () => {
        const saved = {
            id: 'uuid-1',
            name: 'Acme',
            key: 'acme',
            createdAt: new Date('2020-01-01T00:00:00.000Z'),
            updatedAt: new Date('2020-01-01T00:00:00.000Z'),
        };
        mockRepo.create.mockResolvedValue(saved);

        const out = await service.createProject(
            {
                name: '  Acme  ',
                key: 'acme',
            },
            'u1',
        );

        expect(mockRepo.create).toHaveBeenCalledWith({
            name: 'Acme',
            key: 'acme',
        });
        expect(out.key).toBe('acme');
    });

    it('createProject propagates ConflictException from repository', async () => {
        mockRepo.create.mockRejectedValue(new ConflictException('Project key already exists: dup-key'));

        await expect(service.createProject({ name: 'X', key: 'dup-key' }, 'u1')).rejects.toBeInstanceOf(
            ConflictException,
        );
    });

    it('removeProject purges flags then deletes row', async () => {
        mockRepo.findByKey.mockResolvedValue({
            id: '1',
            name: 'X',
            key: 'proj-x',
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        mockFlagsService.purgeProjectFlags.mockResolvedValue(['f1']);
        mockRepo.deleteByKey.mockResolvedValue(undefined);

        await service.removeProject('proj-x', 'alice');

        expect(mockFlagsService.purgeProjectFlags).toHaveBeenCalledWith('proj-x');
        expect(mockRepo.deleteByKey).toHaveBeenCalledWith('proj-x');
        expect(mockRequestLog.append).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'delete-project',
                principalId: 'alice',
            }),
        );
    });

    it('findAll returns mapped DTOs', async () => {
        mockRepo.findAll.mockResolvedValue([
            {
                id: '1',
                name: 'A',
                key: 'a',
                createdAt: new Date('2020-01-01T00:00:00.000Z'),
                updatedAt: new Date('2020-01-01T00:00:00.000Z'),
            },
        ]);

        const list = await service.findAll();
        expect(list).toHaveLength(1);
        expect(list[0].key).toBe('a');
    });
});
