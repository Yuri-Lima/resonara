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

export type TtsEngineName = 'piper' | 'platform' | 'kokoro' | 'auto';

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
  /** Pause-map: how this chunk ends (boundary-aware assembly). */
  endsAt?: string;
  isHeader?: boolean;
  headerLevel?: number;
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
  /** Resolved primary language (en | pt-BR | …). */
  language?: string;
  /** Active pause profile name + resolved insert bands. */
  pauseProfile?: string;
  pauseBands?: Record<string, { minMs: number; maxMs: number; insertMs: number }>;
  /** Mixed-language block map when language=auto detects both. */
  languageBlocks?: Array<{
    language: string;
    startOffset: number;
    endOffset: number;
    wordCount: number;
  }>;
  /** Whisper round-trip QA summary (Phase 6). */
  qa?: {
    mode?: 'off' | 'sample' | 'full';
    aggregateWer?: number;
    failedCount?: number;
    sampledCount?: number;
    threshold?: number;
    chunks?: Array<{
      chunkIndex: number;
      wer: number;
      transcript?: string;
      missing?: string[];
      inserted?: string[];
      qaFailed?: boolean;
      retried?: boolean;
      referenceTokens?: number;
    }>;
  };
  /** Forced-alignment method used for timestamps. */
  alignmentMethod?: 'proportional' | 'forced' | 'none';
  /** Cover art relative key/path. */
  coverKey?: string;
  author?: string;
  /** Resume playback position (ms). */
  resumePositionMs?: number;
  /** Directory with EPUB3 Media Overlays export (SMIL + XHTML + OPF). */
  epubOverlayDir?: string;
  /** Packaged EPUB path (book.epub) when export completed. */
  epubPath?: string;
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
