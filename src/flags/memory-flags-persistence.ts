import { Injectable } from '@nestjs/common';
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

  async findByLookup(
    projectKey: string,
    flagKeyLookup: string,
  ): Promise<FlagAggregate | null> {
    const v = this.map.get(this.rowId(projectKey, flagKeyLookup));
    return v ? structuredClone(v) : null;
  }

  async existsByProjectAndFlagKey(
    projectKey: string,
    flagKey: string,
  ): Promise<boolean> {
    return this.map.has(this.rowId(projectKey, flagKey));
  }

  async listByProject(projectKey: string): Promise<FlagAggregate[]> {
    const p = projectKey.trim();
    return [...this.map.values()]
      .filter((a) => a.projectKey === p)
      .map((a) => structuredClone(a));
  }

  async listAll(): Promise<FlagAggregate[]> {
    return [...this.map.values()].map((a) => structuredClone(a));
  }

  async findManyByProjectAndKeys(
    projectKey: string,
    flagKeys: string[],
  ): Promise<Map<string, FlagAggregate>> {
    const out = new Map<string, FlagAggregate>();
    for (const k of flagKeys) {
      const agg = await this.findByLookup(projectKey, k);
      if (agg) {
        out.set(k.trim(), agg);
      }
    }
    return out;
  }

  async insert(agg: FlagAggregate): Promise<void> {
    const id = this.rowId(agg.projectKey, agg.key);
    if (this.map.has(id)) {
      return;
    }
    this.map.set(id, structuredClone(agg));
  }

  async updateByLookup(
    agg: FlagAggregate,
    lookupFlagKey: string,
  ): Promise<void> {
    const oldId = this.rowId(agg.projectKey, lookupFlagKey);
    const nextId = this.rowId(agg.projectKey, agg.key);
    this.map.delete(oldId);
    this.map.set(nextId, structuredClone(agg));
  }

  async delete(projectKey: string, flagKey: string): Promise<void> {
    this.map.delete(this.rowId(projectKey, flagKey));
  }
}
