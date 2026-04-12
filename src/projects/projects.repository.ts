import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Project } from './models/project.model';

/**
 * In-memory persistence (same process as flags store).
 * Swap implementation for TypeORM `Repository<Project>` when DB is enabled.
 */
@Injectable()
export class ProjectsRepository {
  private readonly store = new Map<string, Project>();

  create(data: {
    name: string;
    key: string;
    environments: string[];
  }): Promise<Project> {
    const key = data.key.trim();
    if (this.store.has(key)) {
      throw new ConflictException(`Project key already exists: ${key}`);
    }
    const now = new Date();
    const row: Project = {
      id: randomUUID(),
      name: data.name,
      key,
      environments: [...data.environments],
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(key, row);
    return Promise.resolve(row);
  }

  findAll(): Promise<Project[]> {
    const rows = [...this.store.values()].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return Promise.resolve(rows);
  }

  findByKey(key: string): Promise<Project | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }
}
