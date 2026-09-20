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

    /**
     * Audit satırı yazar. DB hatası isteği düşürmez, loglar.
     *
     * @param input - resourceId, principalId, action, request
     *
     * @example
     * ```ts
     * await append({
     *   resourceId: '/feature-flags/projects/portal',
     *   principalId: 'ali',
     *   action: 'create-flag',
     *   request: { flagKey: 'new-checkout' },
     * })
     * ```
     */
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

    /**
     * Bir kaynağın audit kayıtlarını sayfalı getirir.
     *
     * @param dto - resourceId, page, pageSize, descending
     * @returns `{ items, page, pageSize, total, totalPages }`
     *
     * @example
     * ```ts
     * await query({ resourceId: '/feature-flags/projects/portal', page: 1, pageSize: 10 })
     * ```
     */
    async query(dto: QueryRequestLogsDto): Promise<{
        items: Record<string, unknown>[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
    }> {
        const page = dto.page ?? 1;
        const pageSize = dto.pageSize ?? 10;
        const descending = dto.descending !== false;
        const rid = dto.resourceId.trim();

        const [rows, total] = await this.repo
            .createQueryBuilder('l')
            .where('l.resource_id = :rid', { rid })
            .orderBy('l.created_at', descending ? 'DESC' : 'ASC')
            .addOrderBy('l.id', descending ? 'DESC' : 'ASC')
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getManyAndCount();

        const items = rows.map((e) => ({
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

        return {
            items,
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
        };
    }
}
