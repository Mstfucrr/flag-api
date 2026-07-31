import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FlagEntity } from '../database/entities/flag.entity';
import type { VersionEntryModel } from './models/version-entry.model';
import type { FlagConditionRow } from './types/flag.types';
import { FlagVersionEntity } from '../database/entities/flag-version.entity';
import { freshTimestamp } from './flags.service.utils';

/** Matches admin controller default when `x-principal-id` is missing. */
function normalizeCreatedBy(createdBy: string | null | undefined): string {
  const t = createdBy?.trim();
  return t ? t : 'system';
}

function versionRowToModel(v: FlagVersionEntity): VersionEntryModel {
  return {
    version: v.version,
    snapshot: structuredClone(v.snapshot),
    createdAt: v.createdAt.toISOString(),
    createdBy: normalizeCreatedBy(v.createdBy),
  };
}

/** Full flag row used by {@link FlagsService} (matches former in-memory aggregate). */
export interface FlagAggregate {
  projectKey: string;
  key: string;
  description: string;
  enabled: boolean;
  rules: FlagConditionRow[];
  currentVersion: number;
  updatedAt: string;
  versions: VersionEntryModel[];
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
  findManyByProjectAndKeys(
    projectKey: string,
    flagKeys: string[],
  ): Promise<Map<string, FlagAggregate>>;
  insert(agg: FlagAggregate): Promise<void>;
  /**
   * @param expectedUpdatedAt Okuma anında görülen `updatedAt` (ISO). DB'deki
   * güncel değer bununla eşleşmiyorsa {@link ConflictException} fırlatılır
   * (optimistic concurrency — flag arada başka biri tarafından değiştirilmiş).
   */
  updateByLookup(
    agg: FlagAggregate,
    lookupFlagKey: string,
    expectedUpdatedAt: string,
  ): Promise<void>;
  /** @param expectedUpdatedAt Bkz. {@link updateByLookup}. */
  patchMetadata(
    projectKey: string,
    flagKey: string,
    fields: { description?: string; enabled?: boolean },
    expectedUpdatedAt: string,
  ): Promise<void>;
  delete(projectKey: string, flagKey: string): Promise<void>;
}

@Injectable()
export class FlagsPersistenceRepository implements IFlagsPersistence {
  constructor(
    @InjectRepository(FlagEntity)
    private readonly repo: Repository<FlagEntity>,
    @InjectRepository(FlagVersionEntity)
    private readonly versionRepo: Repository<FlagVersionEntity>,
  ) {}

  private toAggregate(
    row: FlagEntity,
    versionRows: FlagVersionEntity[],
  ): FlagAggregate {
    const sorted = [...versionRows].sort((a, b) => a.version - b.version);
    return {
      projectKey: row.projectKey,
      key: row.flagKey,
      description: row.description,
      enabled: row.enabled,
      rules: structuredClone(row.rules),
      currentVersion: row.currentVersion,
      updatedAt: row.updatedAt.toISOString(),
      versions: sorted.map(versionRowToModel),
    };
  }

  private versionEntitiesFromAggregate(
    flagId: string,
    agg: FlagAggregate,
  ): FlagVersionEntity[] {
    return agg.versions.map((v) => {
      const e = new FlagVersionEntity();
      e.flagId = flagId;
      e.version = v.version;
      e.snapshot = structuredClone(v.snapshot);
      e.createdAt = new Date(v.createdAt);
      e.createdBy = normalizeCreatedBy(v.createdBy);
      return e;
    });
  }

  private applyAggregate(row: FlagEntity, agg: FlagAggregate): void {
    row.projectKey = agg.projectKey;
    row.flagKey = agg.key;
    row.description = agg.description;
    row.enabled = agg.enabled;
    row.rules = structuredClone(agg.rules);
    row.currentVersion = agg.currentVersion;
    row.updatedAt = new Date(agg.updatedAt);
  }

  async findByLookup(
    projectKey: string,
    flagKeyLookup: string,
  ): Promise<FlagAggregate | null> {
    const row = await this.repo.findOne({
      where: { projectKey: projectKey.trim(), flagKey: flagKeyLookup.trim() },
      relations: { versions: true },
    });
    return row ? this.toAggregate(row, row.versions ?? []) : null;
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
    return rows.map((r) => this.toAggregate(r, []));
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
      out.set(row.flagKey, this.toAggregate(row, []));
    }
    return out;
  }

  async insert(agg: FlagAggregate): Promise<void> {
    const row = new FlagEntity();
    this.applyAggregate(row, agg);
    await this.repo.save(row);
    await this.versionRepo.save(this.versionEntitiesFromAggregate(row.id, agg));
  }

  async patchMetadata(
    projectKey: string,
    flagKey: string,
    fields: { description?: string; enabled?: boolean },
    expectedUpdatedAt: string,
  ): Promise<void> {
    const row = await this.repo.findOne({
      where: { projectKey: projectKey.trim(), flagKey: flagKey.trim() },
    });
    if (!row) {
      throw new NotFoundException(
        `Flag row missing for metadata patch: ${flagKey}`,
      );
    }
    const patch: { description?: string; enabled?: boolean; updatedAt: Date } =
      { updatedAt: new Date(freshTimestamp()) };
    if (fields.description !== undefined) {
      patch.description = fields.description;
    }
    if (fields.enabled !== undefined) {
      patch.enabled = fields.enabled;
    }
    const result = await this.repo.update(
      { id: row.id, updatedAt: new Date(expectedUpdatedAt) },
      patch,
    );
    if (!result.affected) {
      throw new ConflictException(
        `Flag was modified concurrently, reload and retry: ${flagKey}`,
      );
    }
  }

  async updateByLookup(
    agg: FlagAggregate,
    lookupFlagKey: string,
    expectedUpdatedAt: string,
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
    const newVersion = agg.versions[agg.versions.length - 1];
    await this.repo.manager.transaction(async (manager) => {
      const result = await manager.update(
        FlagEntity,
        { id: row.id, updatedAt: new Date(expectedUpdatedAt) },
        {
          projectKey: agg.projectKey,
          flagKey: agg.key,
          description: agg.description,
          enabled: agg.enabled,
          // TypeORM'un QueryDeepPartialEntity tipi, jsonb sütunundaki
          // FlagFilterRow.value: unknown alanıyla yapısal olarak eşleşmiyor.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          rules: structuredClone(agg.rules) as any,
          currentVersion: agg.currentVersion,
          updatedAt: new Date(agg.updatedAt),
        },
      );
      if (!result.affected) {
        throw new ConflictException(
          `Flag was modified concurrently, reload and retry: ${lookupFlagKey}`,
        );
      }
      if (newVersion) {
        await manager.save(
          this.versionEntitiesFromAggregate(row.id, {
            ...agg,
            versions: [newVersion],
          }),
        );
      }
    });
  }

  async delete(projectKey: string, flagKey: string): Promise<void> {
    await this.repo.delete({
      projectKey: projectKey.trim(),
      flagKey: flagKey.trim(),
    });
  }
}
