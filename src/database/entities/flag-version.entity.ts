import { FlagSnapshotModel } from '../../flags/models/flag-snapshot.model';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { FlagEntity } from './flag.entity';

@Entity('flag_versions')
@Unique(['flagId', 'version'])
export class FlagVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'flag_id', type: 'uuid' })
  flagId!: string;

  @ManyToOne(() => FlagEntity, (flag) => flag.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flag_id' })
  flag!: FlagEntity;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'jsonb' })
  snapshot!: FlagSnapshotModel;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'created_by', type: 'varchar', length: 256 })
  createdBy!: string;
}
