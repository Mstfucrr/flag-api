import type { RuleOperator } from '@core-sdk/feature-flags-core';

export type { RuleOperator };

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
