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

/**
 * Tek satır JSON audit log (stdout).
 *
 * @param input - action, kategori, sonuç, isteğe bağlı http/user
 *
 * @example
 * ```ts
 * writeAuditLog({
 *   event_action: 'resource.created',
 *   event_category: 'configuration',
 *   event_outcome: 'success',
 *   resource_id: 'portal:new-checkout',
 * })
 * ```
 */
export function writeAuditLog(input: AuditLogInput): void {
    process.stdout.write(
        `${JSON.stringify({
            audit: true,
            audit_timestamp: new Date().toISOString(),
            ...input,
        })}\n`,
    );
}
