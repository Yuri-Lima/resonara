import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Track } from './track.entity';

export enum JobType {
  TRANSCODE = 'transcode',
  NORMALIZE = 'normalize',
  WAVEFORM = 'waveform',
  SILENCE = 'silence',
  TRIM = 'trim',
  METADATA = 'metadata',
}

export enum JobStatus {
  QUEUED = 'queued',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('transcode_jobs')
export class TranscodeJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'track_id', type: 'text' })
  trackId!: string;

  @ManyToOne(() => Track, (t) => t.jobs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'track_id' })
  track!: Track;

  @Column({ type: 'simple-enum', enum: JobType })
  type!: JobType;

  @Column({ type: 'simple-enum', enum: JobStatus, default: JobStatus.QUEUED })
  status!: JobStatus;

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Column({ name: 'params_json', type: 'simple-json', nullable: true })
  paramsJson!: Record<string, unknown> | null;

  @Column({ name: 'result_json', type: 'simple-json', nullable: true })
  resultJson!: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'bull_job_id', type: 'text', nullable: true })
  bullJobId!: string | null;

  @Column({ name: 'output_storage_key', type: 'text', nullable: true })
  outputStorageKey!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: Date | null;
}
