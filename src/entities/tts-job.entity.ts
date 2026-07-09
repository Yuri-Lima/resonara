import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TtsJobStatus {
  QUEUED = 'queued',
  CHUNKING = 'chunking',
  SYNTHESIZING = 'synthesizing',
  CONCATENATING = 'concatenating',
  NORMALIZING = 'normalizing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export type TtsEngineName = 'piper' | 'platform' | 'auto';

export interface TtsChapterMeta {
  index: number;
  title: string;
  startTime: number;
  endTime: number;
  wordCount: number;
  file?: string;
}

export interface TtsChunkMapEntry {
  index: number;
  startOffset: number;
  endOffset: number;
  textPreview: string;
  audioKey?: string;
  durationMs?: number;
}

export interface TtsJobMetadata {
  duration?: number;
  sampleRate?: number;
  wordCount?: number;
  chunkBoundaries?: number[];
  chunkMap?: TtsChunkMapEntry[];
  chapters?: TtsChapterMeta[];
  title?: string;
  warnings?: string[];
  speakers?: Record<string, string>;
  dialogue?: boolean;
  batchId?: string;
  wordTimestamps?: { word: string; startMs: number; endMs: number }[];
  postProcess?: {
    normalize?: boolean;
    highpass?: boolean;
    compress?: boolean;
    preset?: string;
  };
}

@Entity('tts_jobs')
export class TtsJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'simple-enum',
    enum: TtsJobStatus,
    default: TtsJobStatus.QUEUED,
  })
  status!: TtsJobStatus;

  @Column({ type: 'text' })
  text!: string;

  @Column({ name: 'voice_id', type: 'text', nullable: true })
  voiceId!: string | null;

  @Column({ type: 'text', default: 'auto' })
  engine!: TtsEngineName;

  @Column({ type: 'text', default: 'wav' })
  format!: string;

  @Column({ type: 'float', nullable: true })
  rate!: number | null;

  @Column({ name: 'total_chunks', type: 'int', default: 0 })
  totalChunks!: number;

  @Column({ name: 'completed_chunks', type: 'int', default: 0 })
  completedChunks!: number;

  @Column({ type: 'int', default: 0 })
  progress!: number;

  @Column({ name: 'output_key', type: 'text', nullable: true })
  outputKey!: string | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: TtsJobMetadata | null;

  @Column({ name: 'ssml', type: 'boolean', default: false })
  ssml!: boolean;

  @Column({ name: 'batch_id', type: 'text', nullable: true })
  batchId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: Date | null;
}
