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

export enum PianoTakeStatus {
  UPLOADED = 'uploaded',
  ANALYZING = 'analyzing',
  READY = 'ready',
  ERROR = 'error',
}

@Entity('piano_takes')
export class PianoTake {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'track_id', type: 'text' })
  trackId!: string;

  @ManyToOne(() => Track, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'track_id' })
  track!: Track;

  @Column({ name: 'pack_id', type: 'text', nullable: true })
  packId!: string | null;

  @Column({ name: 'user_label', type: 'text', nullable: true })
  userLabel!: string | null;

  @Column({ name: 'duration_sec', type: 'float', nullable: true })
  durationSec!: number | null;

  @Column({ name: 'midi_stats_json', type: 'simple-json', nullable: true })
  midiStatsJson!: Record<string, unknown> | null;

  @Column({ name: 'analysis_json', type: 'simple-json', nullable: true })
  analysisJson!: Record<string, unknown> | null;

  @Column({
    name: 'analysis_status',
    type: 'simple-enum',
    enum: PianoTakeStatus,
    default: PianoTakeStatus.UPLOADED,
  })
  analysisStatus!: PianoTakeStatus;

  @Column({ name: 'waveform_job_id', type: 'text', nullable: true })
  waveformJobId!: string | null;

  @Column({ name: 'silence_job_id', type: 'text', nullable: true })
  silenceJobId!: string | null;

  @Column({ name: 'normalize_job_id', type: 'text', nullable: true })
  normalizeJobId!: string | null;

  @Column({ name: 'export_job_id', type: 'text', nullable: true })
  exportJobId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
