export type RuleOperator = 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt';

export interface RuleRow {
  id: string;
  field: string;
  operator: RuleOperator;
  value: unknown;
  /** When false, rule is ignored at evaluation time */
  active: boolean;
}
