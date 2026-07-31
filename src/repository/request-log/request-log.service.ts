import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { RequestLogEntity } from '../../database/entities/request-log.entity';
import { QueryRequestLogsDto } from '../../features/request-log/dto/query-request-logs.dto';

export const FEATURE_FLAG_REQUEST_LOG_SERVICE_ID = 'feature-flag-api';

export type RequestLogAppendInput = {
    resourceId: string;
    principalId: string;
    action: string;
    /** JSON-serializable object; stored as JSON.stringify */
    request: unknown;
};

type CursorPayload = { t: number; id: string };

function encodeCursor(p: CursorPayload): string {
    return Buffer.from(JSON.stringify(p), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function decodeCursor(raw: string): CursorPayload | null {
    try {
        const pad = raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4));
        const b64 = raw.replace(/-/g, '+').replace(/_/g, '/') + pad;
        const json = Buffer.from(b64, 'base64').toString('utf8');
        const o = JSON.parse(json) as { t?: number; id?: string };
        if (typeof o.t !== 'number' || typeof o.id !== 'string') {
            return null;
        }
        return { t: o.t, id: o.id };
    } catch {
        return null;
    }
}

function createdAtToMs(value: string | number | Date): number {
    if (typeof value === 'number') {
        return value;
    }
    if (value instanceof Date) {
        return value.getTime();
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class RequestLogService {
    private readonly logger = new Logger(RequestLogService.name);

    constructor(
        @InjectRepository(RequestLogEntity)
        private readonly repo: Repository<RequestLogEntity>,
    ) {}

    async append(input: RequestLogAppendInput): Promise<void> {
        const row = this.repo.create({
            id: randomUUID(),
            resourceId: input.resourceId.trim(),
            code: 'ok',
            state: 0,
            iv: 0,
            principalId: input.principalId.trim() || 'system',
            request: JSON.stringify(input.request ?? {}),
            action: input.action,
            serviceId: FEATURE_FLAG_REQUEST_LOG_SERVICE_ID,
            createdAt: String(Date.now()),
        });
        try {
            await this.repo.save(row);
        } catch (err: unknown) {
            this.logger.error(`RequestLog append failed action=${input.action} resource=${input.resourceId}`, err);
        }
    }

    async query(dto: QueryRequestLogsDto): Promise<{
        items: Record<string, unknown>[];
        prev?: string;
        next?: string;
    }> {
        const delta = dto.delta ?? 10;
        const descending = dto.descending !== false;
        const rid = dto.resourceId.trim();

        const qb = this.repo
            .createQueryBuilder('l')
            .where('l.resource_id = :rid', { rid })
            .orderBy('l.created_at', descending ? 'DESC' : 'ASC')
            .addOrderBy('l.id', descending ? 'DESC' : 'ASC')
            .take(delta + 1);

        if (dto.cursor) {
            const c = decodeCursor(dto.cursor.trim());
            if (c) {
                if (descending) {
                    qb.andWhere('(l.created_at < :ct OR (l.created_at = :ct AND l.id < :cid))', {
                        ct: String(c.t),
                        cid: c.id,
                    });
                } else {
                    qb.andWhere('(l.created_at > :ct OR (l.created_at = :ct AND l.id > :cid))', {
                        ct: String(c.t),
                        cid: c.id,
                    });
                }
            }
        }

        const rows = await qb.getMany();
        const hasMore = rows.length > delta;
        const slice = hasMore ? rows.slice(0, delta) : rows;

        const items = slice.map((e) => ({
            id: e.id,
            resourceId: e.resourceId,
            code: e.code,
            state: e.state,
            iv: e.iv,
            principalId: e.principalId,
            request: e.request,
            action: e.action,
            serviceId: e.serviceId,
            createdAt: createdAtToMs(e.createdAt),
        }));

        let next: string | undefined;
        let prev: string | undefined;

        if (hasMore && slice.length > 0) {
            const last = slice[slice.length - 1];
            next = encodeCursor({
                t: createdAtToMs(last.createdAt),
                id: last.id,
            });
        }

        if (dto.cursor && slice.length > 0) {
            const first = slice[0];
            prev = encodeCursor({
                t: createdAtToMs(first.createdAt),
                id: first.id,
            });
        }

        return { items, prev, next };
    }
}
