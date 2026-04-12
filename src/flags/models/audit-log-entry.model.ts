import type { AuditAction } from '../types/flag.types';

export class AuditLogEntryModel {
  id!: string;
  flagKey!: string;
  action!: AuditAction;
  /** Version number after this operation */
  version!: number;
  summary!: string;
  timestamp!: string;
  /** Actor id (from `X-Principal-Id` header on mutations until auth is wired). */
  principalId!: string;
  /** JSON string: `{ oldData?, newData, summaryNote? }` — vendor-style audit body. */
  request!: string;
}
