import type { FlagConditionRow } from '../../../features/flags/shared/types/flag.types';

/** Immutable flag state at a point in time */
export class FlagSnapshotModel {
    key!: string;
    description!: string;
    enabled!: boolean;
    rules!: FlagConditionRow[];
}
