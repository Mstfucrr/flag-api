import { FlagSnapshotModel } from './flag-snapshot.model';

export class VersionEntryModel {
  version!: number;
  snapshot!: FlagSnapshotModel;
  createdAt!: string;
}
