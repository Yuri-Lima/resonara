import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TtsBatchStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

@Entity('tts_batches')
export class TtsBatch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'simple-enum',
    enum: TtsBatchStatus,
    default: TtsBatchStatus.QUEUED,
  })
  status!: TtsBatchStatus;

  @Column({ name: 'total_jobs', type: 'int', default: 0 })
  totalJobs!: number;

  @Column({ name: 'completed_jobs', type: 'int', default: 0 })
  completedJobs!: number;

  @Column({ name: 'failed_jobs', type: 'int', default: 0 })
  failedJobs!: number;

  @Column({ type: 'simple-json', nullable: true })
  jobIds!: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
