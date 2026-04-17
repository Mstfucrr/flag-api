import type { RuleRow } from '../../flags/types/flag.types';
import type { VersionEntryModel } from '../../flags/models/version-entry.model';
import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('flags')
@Unique(['projectKey', 'flagKey'])
export class FlagEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_key', type: 'varchar', length: 256 })
  projectKey!: string;

  @Column({ name: 'flag_key', type: 'varchar', length: 256 })
  flagKey!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @Column({ type: 'json', default: [] })
  rules!: RuleRow[];

  @Column({ name: 'current_version', type: 'int' })
  currentVersion!: number;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'json', default: [] })
  versions!: VersionEntryModel[];
}
