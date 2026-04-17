import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  FlagAggregate,
  IFlagsPersistence,
} from './flags-persistence.repository';

/** In-memory store for unit tests (no PostgreSQL). */
@Injectable()
export class MemoryFlagsPersistence implements IFlagsPersistence {
  private readonly map = new Map<string, FlagAggregate>();

  private rowId(projectKey: string, flagKey: string): string {
    return `${projectKey.trim()}\x1f${flagKey.trim()}`;
  }

  findByLookup(
    projectKey: string,
    flagKeyLookup: string,
  ): Promise<FlagAggregate | null> {
    const v = this.map.get(this.rowId(projectKey, flagKeyLookup));
    return Promise.resolve(v ? structuredClone(v) : null);
  }

  existsByProjectAndFlagKey(
    projectKey: string,
    flagKey: string,
  ): Promise<boolean> {
    return Promise.resolve(this.map.has(this.rowId(projectKey, flagKey)));
  }

  listByProject(projectKey: string): Promise<FlagAggregate[]> {
    const p = projectKey.trim();
    return Promise.resolve(
      [...this.map.values()]
        .filter((a) => a.projectKey === p)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((a) => structuredClone(a)),
    );
  }

  findManyByProjectAndKeys(
    projectKey: string,
    flagKeys: string[],
  ): Promise<Map<string, FlagAggregate>> {
    const out = new Map<string, FlagAggregate>();
    for (const k of flagKeys) {
      const v = this.map.get(this.rowId(projectKey, k));
      if (v) {
        out.set(k.trim(), structuredClone(v));
      }
    }
    return Promise.resolve(out);
  }

  insert(agg: FlagAggregate): Promise<void> {
    const id = this.rowId(agg.projectKey, agg.key);
    if (this.map.has(id)) {
      throw new ConflictException(`Flag already exists: ${agg.key}`);
    }
    this.map.set(id, structuredClone(agg));
    return Promise.resolve();
  }

  updateByLookup(agg: FlagAggregate, lookupFlagKey: string): Promise<void> {
    const oldId = this.rowId(agg.projectKey, lookupFlagKey);
    if (!this.map.has(oldId)) {
      throw new NotFoundException(
        `Flag row missing for update: ${lookupFlagKey}`,
      );
    }
    const nextId = this.rowId(agg.projectKey, agg.key);
    this.map.delete(oldId);
    this.map.set(nextId, structuredClone(agg));
    return Promise.resolve();
  }

  delete(projectKey: string, flagKey: string): Promise<void> {
    this.map.delete(this.rowId(projectKey, flagKey));
    return Promise.resolve();
  }
}
