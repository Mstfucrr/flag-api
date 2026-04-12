import type { RuleRow } from '../types/flag.types';

/** Immutable flag state at a point in time */
export class FlagSnapshotModel {
  key!: string;
  description!: string;
  enabled!: boolean;
  rules!: RuleRow[];
}
