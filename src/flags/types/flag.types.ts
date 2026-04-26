export type RuleOperator = 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt';

/** One comparison inside a condition (AND with sibling filters). */
export interface FlagFilterRow {
  id?: string;
  field: string;
  operator: RuleOperator;
  value: unknown;
}

/** OR-branch: all filters must match (AND). */
export interface FlagConditionRow {
  id: string;
  filters: FlagFilterRow[];
  /** When false, condition is ignored at evaluation time */
  active: boolean;
}
