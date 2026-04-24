import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('request_logs')
@Index(['resourceId', 'createdAt', 'id'])
export class RequestLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'resource_id', type: 'varchar', length: 512 })
  resourceId!: string;

  @Column({ type: 'varchar', length: 32, default: 'ok' })
  code!: string;

  @Column({ type: 'int', default: 0 })
  state!: number;

  @Column({ type: 'int', default: 0 })
  iv!: number;

  @Column({ name: 'principal_id', type: 'varchar', length: 256, default: '' })
  principalId!: string;

  @Column({ type: 'text', default: '' })
  request!: string;

  @Column({ type: 'varchar', length: 128 })
  action!: string;

  @Column({ name: 'service_id', type: 'varchar', length: 128 })
  serviceId!: string;

  /** Epoch milliseconds (vendor-style API). */
  @Column({ name: 'created_at', type: 'bigint' })
  createdAt!: string;
}
