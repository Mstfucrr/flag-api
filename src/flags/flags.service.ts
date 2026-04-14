import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  isFeatureFlagsAuditResourceId,
  projectKeyFromAuditResourceId,
} from './constants/audit-resource.constants';
import type { AuditAction, RuleRow } from './types/flag.types';
import { CreateFlagDto } from './dto/create-flag.dto';
import { RollbackFlagDto } from './dto/rollback-flag.dto';
import { UpdateFlagDto } from './dto/update-flag.dto';
import type { VendorLogsQueryDto } from './dto/vendor-logs-query.dto';
import type { FlagSnapshotModel } from './models/flag-snapshot.model';
import type { AuditLogEntryModel } from './models/audit-log-entry.model';
import type { VersionEntryModel } from './models/version-entry.model';

interface FlagAggregate {
  /** Portal / projects API client key */
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

@Injectable()
export class FlagsService {
  private readonly store = new Map<string, FlagAggregate>();

  /** Internal row id — never expose as flag key */
  private rowId(projectKey: string, flagKey: string): string {
    return `${projectKey.trim()}\x1f${flagKey.trim()}`;
  }

  create(dto: CreateFlagDto, principalId: string) {
    const projectKey = dto.projectKey.trim();
    const key = dto.key.trim();
    const id = this.rowId(projectKey, key);
    if (this.store.has(id)) {
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
    const auditSummary = 'create';
    const request = this.encodeAuditRequest(null, snapshot);
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
        },
      ],
      history: [
        this.makeLogEntry(
          key,
          'create',
          1,
          auditSummary,
          now,
          principalId,
          request,
        ),
      ],
    };
    this.store.set(id, aggregate);
    return this.toPublic(aggregate);
  }

  findAll(projectKey: string) {
    const p = projectKey.trim();
    return [...this.store.values()]
      .filter((a) => a.projectKey === p)
      .map((a) => this.toPublic(a));
  }

  findOne(projectKey: string, key: string) {
    const agg = this.store.get(this.rowId(projectKey, key));
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${key}`);
    }
    return this.toPublic(agg);
  }

  /**
   * Turn a flag on or off without sending description/rules/key.
   * Reuses {@link update} (new version + audit). No-op if `enabled` already matches.
   */
  setEnabled(
    projectKey: string,
    flagKey: string,
    enabled: boolean,
    principalId: string,
  ) {
    const pk = projectKey.trim();
    const fk = flagKey.trim();
    const agg = this.store.get(this.rowId(pk, fk));
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${fk}`);
    }
    if (agg.enabled === enabled) {
      return this.toPublic(agg);
    }
    const auditSummary = enabled ? 'set enabled' : 'set disabled';
    return this.update(pk, fk, { enabled }, principalId, auditSummary);
  }

  update(
    projectKey: string,
    routeKey: string,
    dto: UpdateFlagDto,
    principalId: string,
    auditSummary = 'update',
  ) {
    const pk = projectKey.trim();
    const rid = this.rowId(pk, routeKey);
    const agg = this.store.get(rid);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${routeKey}`);
    }
    const oldSnapshot = this.buildSnapshot({
      key: agg.key,
      description: agg.description,
      enabled: agg.enabled,
      rules: agg.rules,
    });
    const nextKey = (dto.key ?? routeKey).trim();
    if (nextKey !== routeKey && this.store.has(this.rowId(pk, nextKey))) {
      throw new ConflictException(`Flag already exists: ${nextKey}`);
    }
    const rules = dto.rules !== undefined ? dto.rules : agg.rules;
    const next: FlagAggregate = {
      ...agg,
      projectKey: pk,
      key: nextKey,
      description:
        dto.description !== undefined ? dto.description : agg.description,
      enabled: dto.enabled !== undefined ? dto.enabled : agg.enabled,
      rules,
      currentVersion: agg.currentVersion + 1,
      updatedAt: new Date().toISOString(),
      versions: [...agg.versions],
      history: [...agg.history],
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
    });
    const request = this.encodeAuditRequest(oldSnapshot, snapshot);
    next.history.push(
      this.makeLogEntry(
        next.key,
        'update',
        next.currentVersion,
        auditSummary,
        next.updatedAt,
        principalId,
        request,
      ),
    );
    this.store.delete(rid);
    this.store.set(this.rowId(pk, next.key), next);
    return this.toPublic(next);
  }

  getVersionSnapshot(projectKey: string, key: string, version: number) {
    const agg = this.store.get(this.rowId(projectKey, key));
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
      snapshot: this.deepCloneSnapshot(entry.snapshot),
    };
  }

  getHistory(projectKey: string, key: string) {
    const agg = this.store.get(this.rowId(projectKey, key));
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${key}`);
    }
    const fk = agg.key;
    const sortedHistory = [...agg.history].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
    return {
      flagKey: fk,
      versions: [...agg.versions].sort((a, b) => b.version - a.version),
      audit: {
        items: sortedHistory.map((e) =>
          this.toAuditListItem(e, fk, agg.projectKey),
        ),
        prev: null,
        next: null,
      },
    };
  }

  /**
   * Vendor `POST /vendor-logs` ile aynı cevap şekli: `{ items, prev, next }`.
   * Cursor opak base64url JSON: `{ "skip": number }`.
   */
  queryVendorLogs(dto: VendorLogsQueryDto): {
    items: Record<string, unknown>[];
    prev: string | null;
    next: string | null;
  } {
    const resourceId = dto.resourceId.trim();
    if (!isFeatureFlagsAuditResourceId(resourceId)) {
      throw new BadRequestException(
        `Unsupported resourceId for feature-flag audit. Use /feature-flags-audit/logs or /feature-flags-audit/projects/*`,
      );
    }
    const descending = dto.descending !== false;
    const delta = dto.delta ?? 10;
    const skip = this.decodeAuditCursor(dto.cursor);

    const auditProjectKey = projectKeyFromAuditResourceId(resourceId);

    const merged: Record<string, unknown>[] = [];
    for (const agg of this.store.values()) {
      if (auditProjectKey !== null && agg.projectKey !== auditProjectKey) {
        continue;
      }
      const fk = agg.key;
      for (const e of agg.history) {
        merged.push(this.toAuditListItem(e, fk, agg.projectKey));
      }
    }
    merged.sort((a, b) => {
      const ta = Number(a['createdAt']) || 0;
      const tb = Number(b['createdAt']) || 0;
      return descending ? tb - ta : ta - tb;
    });

    const slice = merged.slice(skip, skip + delta);
    const nextSkip = skip + slice.length;
    const next =
      nextSkip < merged.length
        ? this.encodeAuditCursor({ skip: nextSkip })
        : null;
    const prev =
      skip > 0
        ? this.encodeAuditCursor({ skip: Math.max(0, skip - delta) })
        : null;

    return { items: slice, prev, next };
  }

  remove(projectKey: string, key: string) {
    const id = this.rowId(projectKey, key);
    if (!this.store.has(id)) {
      throw new NotFoundException(`Flag not found: ${key}`);
    }
    this.store.delete(id);
  }

  rollback(
    projectKey: string,
    routeKey: string,
    targetVersion: number,
    _dto: RollbackFlagDto,
    principalId: string,
  ) {
    const pk = projectKey.trim();
    const rid = this.rowId(pk, routeKey);
    const agg = this.store.get(rid);
    if (!agg) {
      throw new NotFoundException(`Flag not found: ${routeKey}`);
    }
    const entry = agg.versions.find((v) => v.version === targetVersion);
    if (!entry) {
      throw new BadRequestException(`Version not found: ${targetVersion}`);
    }
    const snap = entry.snapshot;
    const now = new Date().toISOString();
    const beforeSnapshot = this.buildSnapshot({
      key: agg.key,
      description: agg.description,
      enabled: agg.enabled,
      rules: agg.rules,
    });
    const merged: FlagAggregate = {
      ...agg,
      projectKey: pk,
      key: snap.key,
      description: snap.description,
      enabled: snap.enabled,
      rules: snap.rules,
      currentVersion: agg.currentVersion + 1,
      updatedAt: now,
      versions: [...agg.versions],
      history: [...agg.history],
    };
    const newSnapshot = this.buildSnapshot({
      key: merged.key,
      description: merged.description,
      enabled: merged.enabled,
      rules: merged.rules,
    });
    const auditSummary = `rollback to v${targetVersion}`;
    merged.versions.push({
      version: merged.currentVersion,
      snapshot: this.deepCloneSnapshot(newSnapshot),
      createdAt: now,
    });
    const request = this.encodeAuditRequest(beforeSnapshot, newSnapshot);
    merged.history.push(
      this.makeLogEntry(
        merged.key,
        'rollback',
        merged.currentVersion,
        auditSummary,
        now,
        principalId,
        request,
      ),
    );
    this.store.delete(rid);
    this.store.set(this.rowId(pk, merged.key), merged);
    return this.toPublic(merged);
  }

  private encodeAuditRequest(
    oldData: FlagSnapshotModel | null,
    newData: FlagSnapshotModel,
  ): string {
    const o: Record<string, unknown> = { newData };
    if (oldData !== null) {
      o.oldData = oldData;
    }
    return JSON.stringify(o);
  }

  private auditActionToApiAction(a: AuditAction): string {
    switch (a) {
      case 'create':
        return 'create-flag';
      case 'update':
        return 'update-flag';
      case 'rollback':
        return 'rollback-flag';
      default:
        return String(a);
    }
  }

  private encodeAuditCursor(payload: { skip: number }): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private decodeAuditCursor(cursor: string | undefined): number {
    if (cursor == null || cursor === '') {
      return 0;
    }
    try {
      const raw = Buffer.from(cursor, 'base64url').toString('utf8');
      const j = JSON.parse(raw) as { skip?: unknown };
      const s = j.skip;
      if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) {
        throw new BadRequestException('Invalid cursor');
      }
      return Math.floor(s);
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw new BadRequestException('Invalid cursor');
    }
  }

  private toAuditListItem(
    entry: AuditLogEntryModel,
    flagKeyForResource: string,
    projectKey: string,
  ): Record<string, unknown> {
    return {
      state: 0,
      iv: 0,
      code: 'ok',
      id: entry.id,
      resourceId: `/feature-flags/projects/${encodeURIComponent(projectKey)}/flags/${encodeURIComponent(flagKeyForResource)}`,
      serviceId: 'feature-flag-api',
      principalId: entry.principalId,
      createdAt: new Date(entry.timestamp).getTime(),
      action: this.auditActionToApiAction(entry.action),
      request: entry.request,
      version: entry.version,
      flagKey: entry.flagKey,
      projectKey,
    };
  }

  private makeLogEntry(
    flagKey: string,
    action: AuditAction,
    version: number,
    summary: string,
    timestamp: string,
    principalId: string,
    request: string,
  ): AuditLogEntryModel {
    return {
      id: randomUUID(),
      flagKey,
      action,
      version,
      summary,
      timestamp,
      principalId,
      request,
    };
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

  private toPublic(agg: FlagAggregate) {
    return {
      projectKey: agg.projectKey,
      key: agg.key,
      description: agg.description,
      enabled: agg.enabled,
      rules: structuredClone(agg.rules),
      currentVersion: agg.currentVersion,
      updatedAt: agg.updatedAt,
      versions: agg.versions.map((v) => ({
        version: v.version,
        createdAt: v.createdAt,
        snapshot: this.deepCloneSnapshot(v.snapshot),
      })),
    };
  }
}
