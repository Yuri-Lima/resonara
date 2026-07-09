import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PronunciationEngineScope = 'all' | 'piper' | 'platform';

@Entity('pronunciations')
@Index(['word'], { unique: true })
export class PronunciationEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stored lowercase for case-insensitive uniqueness. */
  @Column({ type: 'text' })
  word!: string;

  @Column({ type: 'text', nullable: true })
  phoneme!: string | null;

  @Column({ type: 'text', nullable: true })
  alias!: string | null;

  @Column({ type: 'text', default: 'all' })
  engine!: PronunciationEngineScope;

  @Column({ type: 'text', default: 'en' })
  language!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
