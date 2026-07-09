import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TranscodeJob } from './transcode-job.entity';

export enum TrackStatus {
  UPLOADED = 'uploaded',
  READY = 'ready',
  PROCESSING = 'processing',
  ERROR = 'error',
}

@Entity('tracks')
export class Track {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'original_filename', type: 'text' })
  originalFilename!: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ name: 'mime_type', type: 'text', nullable: true })
  mimeType!: string | null;

  @Column({ type: 'text', nullable: true })
  format!: string | null;

  @Column({ name: 'duration_sec', type: 'double precision', nullable: true })
  durationSec!: number | null;

  @Column({ name: 'sample_rate', type: 'int', nullable: true })
  sampleRate!: number | null;

  @Column({ type: 'int', nullable: true })
  channels!: number | null;

  @Column({ name: 'bit_rate', type: 'int', nullable: true })
  bitRate!: number | null;

  @Column({ name: 'bit_depth', type: 'int', nullable: true })
  bitDepth!: number | null;

  @Column({ name: 'size_bytes', type: 'bigint', default: 0 })
  sizeBytes!: string;

  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true })
  metadataJson!: Record<string, unknown> | null;

  @Column({ name: 'waveform_key', type: 'text', nullable: true })
  waveformKey!: string | null;

  @Column({
    type: 'enum',
    enum: TrackStatus,
    default: TrackStatus.UPLOADED,
  })
  status!: TrackStatus;

  @OneToMany(() => TranscodeJob, (j) => j.track)
  jobs!: TranscodeJob[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
