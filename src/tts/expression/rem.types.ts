/**
 * Resonara Expression Markup (REM) — engine-agnostic direction layer.
 * Compiles to engine-native controls or graceful degradation (rate/pitch/pause).
 */

export type RemStyle = 'narrative' | 'conversational' | 'newscast' | 'animated';
export type RemEmotion = 'joy' | 'sadness' | 'tension' | 'calm' | 'anger' | 'neutral';

export interface RemStyleDirective {
  kind: 'style';
  style: RemStyle;
}

export interface RemEmotionDirective {
  kind: 'emotion';
  emotion: RemEmotion;
  intensity: number; // 0..1
}

export interface RemEmphasisSpan {
  kind: 'emphasis';
  text: string;
}

export interface RemParalinguistic {
  kind: 'paralinguistic';
  event: 'breath' | 'sigh' | 'laugh' | 'chuckle' | 'cough' | 'gasp' | 'pause';
  /** pause duration ms when event=pause */
  ms?: number;
}

export interface RemCharacterBlock {
  kind: 'character';
  name: string;
  text: string;
}

export interface RemPlainText {
  kind: 'text';
  text: string;
}

export type RemNode =
  | RemStyleDirective
  | RemEmotionDirective
  | RemEmphasisSpan
  | RemParalinguistic
  | RemCharacterBlock
  | RemPlainText;

export interface RemDocument {
  nodes: RemNode[];
  /** Last style seen (document default). */
  style?: RemStyle;
  emotion?: RemEmotion;
  intensity?: number;
  warnings: string[];
}

export type EngineCapability = {
  engine: string;
  paralinguisticTags: boolean;
  emotionControl: boolean;
  cloning: boolean;
  streaming: boolean;
  /** Native tag map for events this engine can perform. */
  nativeTags?: Partial<Record<RemParalinguistic['event'], string>>;
  rateControl: boolean;
  pitchControl: boolean;
};

export interface CompiledSegment {
  text: string;
  /** Speakable text only — no tags that would be read aloud. */
  speakable: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  exaggeration?: number;
  emotion?: RemEmotion;
  intensity?: number;
  style?: RemStyle;
  /** Native engine tags prepended/appended (never as speakable alone). */
  nativePrefix?: string;
  nativeSuffix?: string;
  /** Assembly-level events (breath sample, pause ms) when engine lacks tags. */
  assemblyEvents?: Array<{ type: 'breath' | 'pause' | 'sigh'; ms?: number; gainDb?: number }>;
  character?: string;
  warnings: string[];
}

export interface CompileResult {
  segments: CompiledSegment[];
  warnings: string[];
  /** True if any feature was dropped for this engine. */
  degraded: boolean;
}
