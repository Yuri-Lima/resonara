import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PronunciationEngineScope,
  PronunciationEntry,
} from '../entities/pronunciation.entity';

export interface PronunciationDto {
  word: string;
  phoneme?: string | null;
  alias?: string | null;
  engine?: PronunciationEngineScope;
  language?: string;
}

const DEFAULT_SEED: PronunciationDto[] = [
  { word: 'dr.', alias: 'Doctor' },
  { word: 'mr.', alias: 'Mister' },
  { word: 'mrs.', alias: 'Misses' },
  { word: 'ms.', alias: 'Miz' },
  { word: 'vs.', alias: 'versus' },
  { word: 'etc.', alias: 'et cetera' },
  { word: 'e.g.', alias: 'for example' },
  { word: 'i.e.', alias: 'that is' },
  { word: 'api', alias: 'A P I' },
  { word: 'sql', alias: 'sequel' },
  { word: 'tts', alias: 'text to speech' },
  { word: 'http', alias: 'H T T P' },
  { word: 'https', alias: 'H T T P S' },
];

@Injectable()
export class PronunciationService implements OnModuleInit {
  private readonly logger = new Logger(PronunciationService.name);

  constructor(
    @InjectRepository(PronunciationEntry)
    private readonly repo: Repository<PronunciationEntry>,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.repo.count();
      if (count === 0) {
        for (const s of DEFAULT_SEED) {
          await this.repo.save(
            this.repo.create({
              word: s.word.toLowerCase(),
              phoneme: s.phoneme ?? null,
              alias: s.alias ?? null,
              engine: s.engine ?? 'all',
              language: s.language ?? 'en',
            }),
          );
        }
        this.logger.log(`Seeded ${DEFAULT_SEED.length} pronunciation entries`);
      }
    } catch (e) {
      this.logger.warn(`Pronunciation seed skipped: ${(e as Error).message}`);
    }
  }

  async list(): Promise<PronunciationEntry[]> {
    return this.repo.find({ order: { word: 'ASC' } });
  }

  async create(dto: PronunciationDto): Promise<PronunciationEntry> {
    const word = (dto.word || '').trim().toLowerCase();
    if (!word) throw new BadRequestException('word is required');
    if (!dto.phoneme && !dto.alias) {
      throw new BadRequestException('phoneme or alias is required');
    }
    const existing = await this.repo.findOne({ where: { word } });
    if (existing) {
      throw new BadRequestException(`Entry already exists for "${word}"`);
    }
    return this.repo.save(
      this.repo.create({
        word,
        phoneme: dto.phoneme ?? null,
        alias: dto.alias ?? null,
        engine: dto.engine ?? 'all',
        language: dto.language ?? 'en',
      }),
    );
  }

  async update(id: string, dto: Partial<PronunciationDto>): Promise<PronunciationEntry> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException(`Pronunciation ${id} not found`);
    if (dto.word != null) entry.word = dto.word.trim().toLowerCase();
    if (dto.phoneme !== undefined) entry.phoneme = dto.phoneme;
    if (dto.alias !== undefined) entry.alias = dto.alias;
    if (dto.engine != null) entry.engine = dto.engine;
    if (dto.language != null) entry.language = dto.language;
    return this.repo.save(entry);
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException(`Pronunciation ${id} not found`);
  }

  async importJson(entries: PronunciationDto[]): Promise<{ imported: number }> {
    if (!Array.isArray(entries)) {
      throw new BadRequestException('expected array of entries');
    }
    let imported = 0;
    for (const e of entries) {
      const word = (e.word || '').trim().toLowerCase();
      if (!word) continue;
      let row = await this.repo.findOne({ where: { word } });
      if (!row) {
        row = this.repo.create({ word });
      }
      row.phoneme = e.phoneme ?? row.phoneme ?? null;
      row.alias = e.alias ?? row.alias ?? null;
      row.engine = e.engine ?? row.engine ?? 'all';
      row.language = e.language ?? row.language ?? 'en';
      await this.repo.save(row);
      imported++;
    }
    return { imported };
  }

  async exportJson(): Promise<PronunciationDto[]> {
    const rows = await this.list();
    return rows.map((r) => ({
      word: r.word,
      phoneme: r.phoneme,
      alias: r.alias,
      engine: r.engine,
      language: r.language,
    }));
  }

  /**
   * Apply dictionary to text: inject SSML phoneme/sub or plain aliases.
   */
  async applyDictionary(
    text: string,
    engine: 'piper' | 'platform' | 'all' = 'all',
  ): Promise<string> {
    if (!text) return text;
    const entries = await this.repo.find();
    if (!entries.length) return text;

    // Longer words first to avoid partial issues
    const sorted = entries
      .filter((e) => e.engine === 'all' || e.engine === engine)
      .sort((a, b) => b.word.length - a.word.length);

    let out = text;
    for (const e of sorted) {
      const escaped = e.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      if (e.phoneme) {
        out = out.replace(
          re,
          `<phoneme alphabet="ipa" ph="${e.phoneme}">${e.word}</phoneme>`,
        );
      } else if (e.alias) {
        out = out.replace(re, `<sub alias="${e.alias}">${e.word}</sub>`);
      }
    }
    return out;
  }
}
