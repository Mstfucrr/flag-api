export type AuditOutcome = 'success' | 'failure' | 'attempt';

export interface AuditLogInput {
    event_action: string;
    event_category: string;
    event_outcome: AuditOutcome;
    http_method?: string;
    http_path?: string;
    http_status?: number;
    duration_ms?: number;
    resource_id?: string;
    user_id?: string;
    error_code?: string;
}

export function writeAuditLog(input: AuditLogInput): void {
    process.stdout.write(
        `${JSON.stringify({
            audit: true,
            audit_timestamp: new Date().toISOString(),
            ...input,
        })}\n`,
    );
}
