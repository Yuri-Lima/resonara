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
  // English
  { word: 'dr.', alias: 'Doctor', language: 'en' },
  { word: 'mr.', alias: 'Mister', language: 'en' },
  { word: 'mrs.', alias: 'Misses', language: 'en' },
  { word: 'ms.', alias: 'Miz', language: 'en' },
  { word: 'vs.', alias: 'versus', language: 'en' },
  { word: 'etc.', alias: 'et cetera', language: 'en' },
  { word: 'e.g.', alias: 'for example', language: 'en' },
  { word: 'i.e.', alias: 'that is', language: 'en' },
  { word: 'api', alias: 'A P I', language: 'en' },
  { word: 'sql', alias: 'sequel', language: 'en' },
  { word: 'tts', alias: 'text to speech', language: 'en' },
  { word: 'http', alias: 'H T T P', language: 'en' },
  { word: 'https', alias: 'H T T P S', language: 'en' },
  // Brazilian Portuguese
  { word: 'sr.', alias: 'Senhor', language: 'pt-BR' },
  { word: 'sra.', alias: 'Senhora', language: 'pt-BR' },
  { word: 'dr.', alias: 'Doutor', language: 'pt-BR' },
  { word: 'dra.', alias: 'Doutora', language: 'pt-BR' },
  { word: 'prof.', alias: 'Professor', language: 'pt-BR' },
  { word: 'profa.', alias: 'Professora', language: 'pt-BR' },
  { word: 'av.', alias: 'Avenida', language: 'pt-BR' },
  { word: 'ltda.', alias: 'Limitada', language: 'pt-BR' },
  { word: 'cpf', alias: 'C P F', language: 'pt-BR' },
  { word: 'cnpj', alias: 'C N P J', language: 'pt-BR' },
  { word: 'cep', alias: 'C E P', language: 'pt-BR' },
  { word: 'ibge', alias: 'I B G E', language: 'pt-BR' },
  { word: 'inss', alias: 'I N S S', language: 'pt-BR' },
  { word: 'fgts', alias: 'F G T S', language: 'pt-BR' },
  { word: 'software', alias: 'sóftuer', language: 'pt-BR' },
  { word: 'hardware', alias: 'rárduer', language: 'pt-BR' },
  { word: 'marketing', alias: 'márketing', language: 'pt-BR' },
  { word: 'feedback', alias: 'fídbéc', language: 'pt-BR' },
  { word: 'startup', alias: 'stártâp', language: 'pt-BR' },
  { word: 'download', alias: 'daunlôudi', language: 'pt-BR' },
  { word: 'upload', alias: 'aplôudi', language: 'pt-BR' },
  { word: 'framework', alias: 'frêimuórque', language: 'pt-BR' },
  { word: 'açaí', alias: 'ah-sah-í', language: 'pt-BR' },
  { word: 'guaraná', alias: 'gwah-rah-ná', language: 'pt-BR' },
  { word: 'recife', alias: 'heh-sí-fi', language: 'pt-BR' },
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
      let added = 0;
      for (const s of DEFAULT_SEED) {
        const word = s.word.toLowerCase();
        const language = s.language ?? 'en';
        const existing = await this.repo.findOne({ where: { word, language } });
        if (existing) continue;
        await this.repo.save(
          this.repo.create({
            word,
            phoneme: s.phoneme ?? null,
            alias: s.alias ?? null,
            engine: s.engine ?? 'all',
            language,
          }),
        );
        added += 1;
      }
      if (added) {
        this.logger.log(`Seeded ${added} pronunciation entries`);
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
    const language = dto.language ?? 'en';
    const existing = await this.repo.findOne({ where: { word, language } });
    if (existing) {
      throw new BadRequestException(
        `Entry already exists for "${word}" (${language})`,
      );
    }
    return this.repo.save(
      this.repo.create({
        word,
        phoneme: dto.phoneme ?? null,
        alias: dto.alias ?? null,
        engine: dto.engine ?? 'all',
        language,
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
      const language = e.language ?? 'en';
      let row = await this.repo.findOne({ where: { word, language } });
      if (!row) {
        row = this.repo.create({ word, language });
      }
      row.phoneme = e.phoneme ?? row.phoneme ?? null;
      row.alias = e.alias ?? row.alias ?? null;
      row.engine = e.engine ?? row.engine ?? 'all';
      row.language = language;
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
   * When language is set, only entries for that language (or language-empty legacy rows) apply.
   * Never cross-applies English rules to Portuguese or vice versa.
   */
  async applyDictionary(
    text: string,
    engine: 'piper' | 'platform' | 'all' = 'all',
    language?: string,
  ): Promise<string> {
    if (!text) return text;
    const entries = await this.repo.find();
    if (!entries.length) return text;

    const langNorm = language
      ? language.toLowerCase().replace(/_/g, '-')
      : undefined;
    const langBase = langNorm?.startsWith('pt')
      ? 'pt-br'
      : langNorm?.startsWith('en')
        ? 'en'
        : langNorm;

    // Longer words first to avoid partial issues
    const sorted = entries
      .filter((e) => e.engine === 'all' || e.engine === engine)
      .filter((e) => {
        if (!langBase) return true;
        const el = (e.language || 'en').toLowerCase().replace(/_/g, '-');
        const eBase = el.startsWith('pt') ? 'pt-br' : el.startsWith('en') ? 'en' : el;
        return eBase === langBase;
      })
      .sort((a, b) => b.word.length - a.word.length);

    let out = text;
    for (const e of sorted) {
      const escaped = e.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Allow matching accented words
      const re = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'giu');
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

  async listByLanguage(language: string): Promise<PronunciationEntry[]> {
    const all = await this.list();
    const langBase = language.toLowerCase().replace(/_/g, '-').startsWith('pt')
      ? 'pt-br'
      : language.toLowerCase().replace(/_/g, '-').startsWith('en')
        ? 'en'
        : language.toLowerCase();
    return all.filter((e) => {
      const el = (e.language || 'en').toLowerCase().replace(/_/g, '-');
      const eBase = el.startsWith('pt') ? 'pt-br' : el.startsWith('en') ? 'en' : el;
      return eBase === langBase;
    });
  }
}
