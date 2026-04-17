import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FlagEntity } from '../database/entities/flag.entity';
import type { AuditLogEntryModel } from './models/audit-log-entry.model';
import type { VersionEntryModel } from './models/version-entry.model';
import type { RuleRow } from './types/flag.types';

/** Full flag row used by {@link FlagsService} (matches former in-memory aggregate). */
export interface FlagAggregate {
  projectKey: string;
  key: string;
  description: string;
  enabled: boolean;
  rules: RuleRow[];
  currentVersion: number;
  updatedAt: string;
  versions: VersionEntryModel[];
  history: AuditLogEntryModel[];
}

export const FLAGS_PERSISTENCE = Symbol('FLAGS_PERSISTENCE');

export interface IFlagsPersistence {
  findByLookup(
    projectKey: string,
    flagKeyLookup: string,
  ): Promise<FlagAggregate | null>;
  existsByProjectAndFlagKey(
    projectKey: string,
    flagKey: string,
  ): Promise<boolean>;
  listByProject(projectKey: string): Promise<FlagAggregate[]>;
  listAll(): Promise<FlagAggregate[]>;
  findManyByProjectAndKeys(
    projectKey: string,
    flagKeys: string[],
  ): Promise<Map<string, FlagAggregate>>;
  insert(agg: FlagAggregate): Promise<void>;
  updateByLookup(agg: FlagAggregate, lookupFlagKey: string): Promise<void>;
  delete(projectKey: string, flagKey: string): Promise<void>;
}

@Injectable()
export class FlagsPersistenceRepository implements IFlagsPersistence {
  constructor(
    @InjectRepository(FlagEntity)
    private readonly repo: Repository<FlagEntity>,
  ) {}

  private toAggregate(row: FlagEntity): FlagAggregate {
    return {
      projectKey: row.projectKey,
      key: row.flagKey,
      description: row.description,
      enabled: row.enabled,
      rules: structuredClone(row.rules),
      currentVersion: row.currentVersion,
      updatedAt: row.updatedAt.toISOString(),
      versions: structuredClone(row.versions),
      history: structuredClone(row.history),
    };
  }

  private applyAggregate(row: FlagEntity, agg: FlagAggregate): void {
    row.projectKey = agg.projectKey;
    row.flagKey = agg.key;
    row.description = agg.description;
    row.enabled = agg.enabled;
    row.rules = structuredClone(agg.rules);
    row.currentVersion = agg.currentVersion;
    row.updatedAt = new Date(agg.updatedAt);
    row.versions = structuredClone(agg.versions);
    row.history = structuredClone(agg.history);
  }

  async findByLookup(
    projectKey: string,
    flagKeyLookup: string,
  ): Promise<FlagAggregate | null> {
    const row = await this.repo.findOne({
      where: { projectKey: projectKey.trim(), flagKey: flagKeyLookup.trim() },
    });
    return row ? this.toAggregate(row) : null;
  }

  async existsByProjectAndFlagKey(
    projectKey: string,
    flagKey: string,
  ): Promise<boolean> {
    const n = await this.repo.count({
      where: { projectKey: projectKey.trim(), flagKey: flagKey.trim() },
    });
    return n > 0;
  }

  async listByProject(projectKey: string): Promise<FlagAggregate[]> {
    const rows = await this.repo.find({
      where: { projectKey: projectKey.trim() },
      order: { flagKey: 'ASC' },
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async listAll(): Promise<FlagAggregate[]> {
    const rows = await this.repo.find({
      order: { projectKey: 'ASC', flagKey: 'ASC' },
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async findManyByProjectAndKeys(
    projectKey: string,
    flagKeys: string[],
  ): Promise<Map<string, FlagAggregate>> {
    const pk = projectKey.trim();
    const keys = [...new Set(flagKeys.map((k) => k.trim()).filter(Boolean))];
    const out = new Map<string, FlagAggregate>();
    if (keys.length === 0) {
      return out;
    }
    const rows = await this.repo.find({
      where: { projectKey: pk, flagKey: In(keys) },
    });
    for (const row of rows) {
      out.set(row.flagKey, this.toAggregate(row));
    }
    return out;
  }

  async insert(agg: FlagAggregate): Promise<void> {
    const row = new FlagEntity();
    this.applyAggregate(row, agg);
    await this.repo.save(row);
  }

  async updateByLookup(
    agg: FlagAggregate,
    lookupFlagKey: string,
  ): Promise<void> {
    const row = await this.repo.findOne({
      where: {
        projectKey: agg.projectKey.trim(),
        flagKey: lookupFlagKey.trim(),
      },
    });
    if (!row) {
      throw new NotFoundException(
        `Flag row missing for update: ${lookupFlagKey}`,
      );
    }
    this.applyAggregate(row, agg);
    await this.repo.save(row);
  }

  async delete(projectKey: string, flagKey: string): Promise<void> {
    await this.repo.delete({
      projectKey: projectKey.trim(),
      flagKey: flagKey.trim(),
    });
  }
}
