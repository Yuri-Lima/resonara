import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface SamplePackNote {
  midi: number;
  name: string;
  key: string;
  durationSec?: number;
}

export interface SamplePackManifest {
  id: string;
  name: string;
  format: string;
  sampleRate: number;
  baseNote: string;
  notes: SamplePackNote[];
  velocityLayers?: Array<{ id: string; min: number; max: number }>;
  releaseMs: number;
  maxPolyphony: number;
  license: string;
  keyRange?: { low: number; high: number };
}

@Entity('sample_packs')
export class SamplePack {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'storage_prefix', type: 'text' })
  storagePrefix!: string;

  @Column({ name: 'manifest_json', type: 'simple-json' })
  manifestJson!: SamplePackManifest;

  @Column({ type: 'text', default: 'ready' })
  status!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
