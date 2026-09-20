import type { FlagConditionRow } from '../../features/flags/shared/types/flag.types';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { FlagVersionEntity } from './flag-version.entity';

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
    rules!: FlagConditionRow[];

    @Column({ name: 'current_version', type: 'int' })
    currentVersion!: number;

    @Column({ name: 'updated_at', type: 'timestamptz' })
    updatedAt!: Date;

    @OneToMany(() => FlagVersionEntity, (version) => version.flag)
    versions!: FlagVersionEntity[];
}
