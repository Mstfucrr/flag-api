export type AuditAction = 'create' | 'update' | 'rollback';

export type RuleOperator = 'eq' | 'neq' | 'contains' | 'in';

export interface RuleRow {
  id: string;
  field: string;
  operator: RuleOperator;
  value: unknown;
  /** When false, rule is ignored at evaluation time */
  active: boolean;
}
