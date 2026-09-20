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

    /**
     * Yeni proje satırı yazar.
     *
     * @param data - name, key
     * @returns Kaydedilen proje
     * @throws {ConflictException} Key zaten varsa
     *
     * @example
     * ```ts
     * await create({ name: 'Portal', key: 'portal' })
     * ```
     */
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

    /**
     * Tüm projeleri oluşturulma sırasıyla döner.
     *
     * @returns Proje listesi
     *
     * @example
     * ```ts
     * await findAll()
     * // [{ key: 'portal' }]
     * ```
     */
    async findAll(): Promise<Project[]> {
        const rows = await this.repo.find({ order: { createdAt: 'ASC' } });
        return rows.map((r) => this.toModel(r));
    }

    /**
     * Key ile proje okur.
     *
     * @param key - Proje anahtarı
     * @returns Proje veya yoksa `null`
     *
     * @example
     * ```ts
     * await findByKey('portal')
     * ```
     */
    async findByKey(key: string): Promise<Project | null> {
        const row = await this.repo.findOne({ where: { key: key.trim() } });
        return row ? this.toModel(row) : null;
    }

    /**
     * Projeyi key ile siler. Flag cascade yok; servis önce flag siler.
     *
     * @param key - Proje anahtarı
     * @throws {NotFoundException} Proje yoksa
     *
     * @example
     * ```ts
     * await deleteByKey('portal')
     * ```
     */
    async deleteByKey(key: string): Promise<void> {
        const k = key.trim();
        const res = await this.repo.delete({ key: k });
        if (!res.affected) {
            throw new NotFoundException(`Project not found: ${k}`);
        }
    }
}
