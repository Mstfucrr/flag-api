import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { RuleRow } from './types/flag.types';
import { CreateFlagDto } from './dto/create-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import type { FlagSnapshotModel } from './models/flag-snapshot.model';
import {
  FLAGS_PERSISTENCE,
  type FlagAggregate,
  type IFlagsPersistence,
} from './flags-persistence.repository';
import { evaluateFlag } from '@core-sdk/feature-flags-core';

type DeclarativeRule = {
  id: string;
  field: string;
  operator: RuleRow['operator'];
  value: unknown;
  active: boolean;
};

type EvaluateFlagFn = (
  definition: { enabled: boolean; rules: DeclarativeRule[] },
  context: Record<string, unknown>,
) => { enabled: boolean };

@Injectable()
export class FlagsService {
  private readonly logger = new Logger(FlagsService.name);

  constructor(
    @Inject(FLAGS_PERSISTENCE) private readonly flags: IFlagsPersistence,
  ) {}

  async create(dto: CreateFlagDto, principalId: string) {
    const projectKey = dto.projectKey.trim();
    const key = dto.key.trim();
    if (await this.flags.existsByProjectAndFlagKey(projectKey, key)) {
      throw new ConflictException(
        `Flag already exists in project ${projectKey}: ${key}`,
      );
    }
    const now = new Date().toISOString();
    const rules = dto.rules !== undefined ? dto.rules : [];
    const snapshot = this.buildSnapshot({
      key,
      description: dto.description ?? '',
      enabled: dto.enabled,
      rules,
    });
    const aggregate: FlagAggregate = {
      projectKey,
      key,
      description: dto.description ?? '',
      enabled: dto.enabled,
      rules,
      currentVersion: 1,
      updatedAt: now,
      versions: [
        {
          version: 1,
          snapshot: this.deepCloneSnapshot(snapshot),
          createdAt: now,
          createdBy: principalId,
        },
      ],
    };
    await this.flags.insert(aggregate);
    this.logger.log(
      `Flag created: project=${projectKey} key=${key} v=1 principal=${principalId}`,
    );
    return this.toAdminCurrent(aggregate);
  }

  async findAll(projectKey: string) {
    const p = projectKey.trim();
    const list = await this.flags.listByProject(p);
    return list.map((a) => this.toRuntime(a));
  }

  async findAllAdmin(projectKey: string) {
    const p = projectKey.trim();
    const list = await this.flags.listByProject(p);
    return list.map((a) => this.toAdminCurrent(a));
  }

  async evaluate(
    projectKey: string,
    flagKeys: string[],
    context: Record<string, unknown> = {},
  ) {
    const p = projectKey.trim();
    const results: Record<string, { enabled: boolean }> = {};
    const loaded = await this.flags.findManyByProjectAndKeys(p, flagKeys);

    for (const rawKey of flagKeys) {
      const key = rawKey.trim();
      if (!key) {
        continue;
      }
      const agg = loaded.get(key);
      results[key] = {
        enabled:
          agg !== undefined
            ? this.evaluateRuntimeEnabled(agg.enabled, agg.rules, context)
            : false,
      };
    }

    return { results };
  }

  async findOne(projectKey: string, key: string) {
    const agg = await this.flags.findByLookup(projectKey, key);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${key}`);
    }
    return this.toRuntime(agg);
  }

  async findOneAdmin(projectKey: string, key: string) {
    const agg = await this.flags.findByLookup(projectKey, key);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${key}`);
    }
    return this.toAdminCurrent(agg);
  }

  async setEnabled(
    projectKey: string,
    flagKey: string,
    enabled: boolean,
    principalId: string,
  ) {
    const pk = projectKey.trim();
    const fk = flagKey.trim();
    const agg = await this.flags.findByLookup(pk, fk);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${fk}`);
    }
    if (agg.enabled === enabled) {
      return this.toAdminCurrent(agg);
    }
    return await this.update(pk, fk, { enabled }, principalId);
  }

  async update(
    projectKey: string,
    routeKey: string,
    dto: UpdateFlagDto,
    principalId: string,
  ) {
    const pk = projectKey.trim();
    const agg = await this.flags.findByLookup(pk, routeKey);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${routeKey}`);
    }
    const rules = dto.rules !== undefined ? dto.rules : agg.rules;
    const next: FlagAggregate = {
      ...agg,
      projectKey: pk,
      key: agg.key,
      description:
        dto.description !== undefined ? dto.description : agg.description,
      enabled: dto.enabled !== undefined ? dto.enabled : agg.enabled,
      rules,
      currentVersion: agg.currentVersion + 1,
      updatedAt: new Date().toISOString(),
      versions: [...agg.versions],
    };
    const snapshot = this.buildSnapshot({
      key: next.key,
      description: next.description,
      enabled: next.enabled,
      rules: next.rules,
    });
    next.versions.push({
      version: next.currentVersion,
      snapshot: this.deepCloneSnapshot(snapshot),
      createdAt: next.updatedAt,
      createdBy: principalId,
    });
    await this.flags.updateByLookup(next, routeKey);
    this.logger.log(
      `Flag updated: project=${pk} key=${next.key} v=${next.currentVersion} principal=${principalId}`,
    );
    return this.toAdminCurrent(next);
  }

  async getVersionSnapshot(projectKey: string, key: string, version: number) {
    const agg = await this.flags.findByLookup(projectKey, key);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${key}`);
    }
    const entry = agg.versions.find((v) => v.version === version);
    if (!entry) {
      throw new NotFoundException(`Version not found: ${version}`);
    }
    return {
      version: entry.version,
      createdAt: entry.createdAt,
      createdBy: entry.createdBy ?? '',
      snapshot: this.deepCloneSnapshot(entry.snapshot),
    };
  }

  async getHistory(projectKey: string, key: string) {
    const agg = await this.flags.findByLookup(projectKey, key);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${key}`);
    }
    const fk = agg.key;
    return {
      flagKey: fk,
      versions: [...agg.versions].sort((a, b) => b.version - a.version),
    };
  }

  async remove(projectKey: string, key: string) {
    const pk = projectKey.trim();
    const fk = key.trim();
    if (!(await this.flags.existsByProjectAndFlagKey(pk, fk))) {
      throw new NotFoundException(`Flag not found: ${key}`);
    }
    await this.flags.delete(pk, fk);
    this.logger.log(`Flag deleted: project=${pk} key=${fk}`);
  }

  async rollback(
    projectKey: string,
    routeKey: string,
    targetVersion: number,
    principalId: string,
  ) {
    const pk = projectKey.trim();
    const agg = await this.flags.findByLookup(pk, routeKey);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${routeKey}`);
    }
    const entry = agg.versions.find((v) => v.version === targetVersion);
    if (!entry) {
      throw new BadRequestException(`Version not found: ${targetVersion}`);
    }
    const snap = entry.snapshot;
    const now = new Date().toISOString();
    const merged: FlagAggregate = {
      ...agg,
      projectKey: pk,
      key: agg.key,
      description: snap.description,
      enabled: snap.enabled,
      rules: snap.rules,
      currentVersion: agg.currentVersion + 1,
      updatedAt: now,
      versions: [...agg.versions],
    };
    const newSnapshot = this.buildSnapshot({
      key: merged.key,
      description: merged.description,
      enabled: merged.enabled,
      rules: merged.rules,
    });
    merged.versions.push({
      version: merged.currentVersion,
      snapshot: this.deepCloneSnapshot(newSnapshot),
      createdAt: now,
      createdBy: principalId,
    });
    await this.flags.updateByLookup(merged, routeKey);
    this.logger.log(
      `Flag rollback: project=${pk} key=${merged.key} restoredFrom=v${targetVersion} newVersion=v${merged.currentVersion} principal=${principalId}`,
    );
    return this.toAdminCurrent(merged);
  }

  private buildSnapshot(p: {
    key: string;
    description: string;
    enabled: boolean;
    rules: RuleRow[];
  }): FlagSnapshotModel {
    return {
      key: p.key,
      description: p.description,
      enabled: p.enabled,
      rules: structuredClone(p.rules),
    };
  }

  private deepCloneSnapshot(s: FlagSnapshotModel): FlagSnapshotModel {
    return structuredClone(s);
  }

  /** SDK/public GET: key only — evaluation is via POST …/flags/evaluate with context. */
  private toRuntime(agg: FlagAggregate) {
    return {
      key: agg.key,
    };
  }

  private toAdminCurrent(agg: FlagAggregate) {
    return {
      projectKey: agg.projectKey,
      key: agg.key,
      description: agg.description,
      enabled: agg.enabled,
      rules: structuredClone(agg.rules),
      currentVersion: agg.currentVersion,
      updatedAt: agg.updatedAt,
    };
  }

  private evaluateRuntimeEnabled(
    masterEnabled: boolean,
    rules: RuleRow[],
    context: Record<string, unknown>,
  ): boolean {
    const evaluateFlagStrict = evaluateFlag as EvaluateFlagFn;
    const declarativeRules: DeclarativeRule[] = rules.map((rule) => ({
      id: rule.id,
      field: rule.field,
      operator: rule.operator,
      value: rule.value,
      active: rule.active !== false,
    }));
    return evaluateFlagStrict(
      {
        enabled: masterEnabled,
        rules: declarativeRules,
      },
      context,
    ).enabled;
  }
}
