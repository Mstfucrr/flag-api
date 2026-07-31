import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { ProjectEntity } from '../../database/entities/project.entity';
import type { Project } from './models/project.model';

@Injectable()
export class ProjectsRepository {
    constructor(
        @InjectRepository(ProjectEntity)
        private readonly repo: Repository<ProjectEntity>,
    ) {}

    private toModel(e: ProjectEntity): Project {
        return {
            id: e.id,
            name: e.name,
            key: e.key,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
        };
    }

    async create(data: { name: string; key: string }): Promise<Project> {
        const key = data.key.trim();
        const row = this.repo.create({
            name: data.name.trim(),
            key,
        });
        try {
            const saved = await this.repo.save(row);
            return this.toModel(saved);
        } catch (e) {
            if (
                e instanceof QueryFailedError &&
                (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
            ) {
                throw new ConflictException(`Project key already exists: ${key}`);
            }
            throw e;
        }
    }

    async findAll(): Promise<Project[]> {
        const rows = await this.repo.find({ order: { createdAt: 'ASC' } });
        return rows.map((r) => this.toModel(r));
    }

    async findByKey(key: string): Promise<Project | null> {
        const row = await this.repo.findOne({ where: { key: key.trim() } });
        return row ? this.toModel(row) : null;
    }

    async deleteByKey(key: string): Promise<void> {
        const k = key.trim();
        const res = await this.repo.delete({ key: k });
        if (!res.affected) {
            throw new NotFoundException(`Project not found: ${k}`);
        }
    }
}
