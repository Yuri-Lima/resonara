/**
 * Compile REM documents to per-engine speakable segments + controls.
 * CRITICAL: paralinguistic events must NEVER appear as spoken words.
 */
import { parseRem, hasLiteralTagLeak, stripRemToPlain } from './rem-parser';
import {
  CompileResult,
  CompiledSegment,
  EngineCapability,
  RemDocument,
  RemEmotion,
  RemNode,
  RemStyle,
} from './rem.types';

/** Capability matrix used for degradation. */
export const ENGINE_CAPABILITIES: Record<string, EngineCapability> = {
  expressive: {
    engine: 'expressive',
    paralinguisticTags: true,
    emotionControl: true,
    cloning: true,
    streaming: false,
    rateControl: true,
    pitchControl: false,
    nativeTags: {
      laugh: '[laugh]',
      chuckle: '[chuckle]',
      cough: '[cough]',
      sigh: '[sigh]',
      breath: '[breath]',
      gasp: '[gasp]',
      pause: '', // handled as silence
    },
  },
  orpheus: {
    engine: 'orpheus',
    paralinguisticTags: true,
    emotionControl: true,
    cloning: false,
    streaming: true,
    rateControl: false,
    pitchControl: false,
    nativeTags: {
      laugh: '<laugh>',
      chuckle: '<chuckle>',
      sigh: '<sigh>',
      cough: '<cough>',
      gasp: '<gasp>',
      breath: '<sigh>',
      pause: '',
    },
  },
  kokoro: {
    engine: 'kokoro',
    paralinguisticTags: false,
    emotionControl: false,
    cloning: false,
    streaming: false,
    rateControl: true,
    pitchControl: false,
  },
  piper: {
    engine: 'piper',
    paralinguisticTags: false,
    emotionControl: false,
    cloning: false,
    streaming: false,
    rateControl: true,
    pitchControl: false,
  },
  platform: {
    engine: 'platform',
    paralinguisticTags: false,
    emotionControl: false,
    cloning: false,
    streaming: false,
    rateControl: true,
    pitchControl: true,
  },
};

/** Emotion → rate/pitch approximations for non-expressive engines. */
function emotionToProsody(
  emotion: RemEmotion | undefined,
  intensity: number,
  style?: RemStyle,
): { rate?: number; pitch?: number; volume?: number; exaggeration?: number } {
  const i = intensity ?? 0.5;
  let rate = 1.0;
  let pitch = 1.0;
  let volume = 1.0;
  let exaggeration = 0.5;

  switch (emotion) {
    case 'joy':
      rate = 1.0 + 0.08 * i;
      pitch = 1.0 + 0.06 * i;
      exaggeration = 0.5 + 0.35 * i;
      break;
    case 'sadness':
      rate = 1.0 - 0.12 * i;
      pitch = 1.0 - 0.08 * i;
      volume = 1.0 - 0.15 * i;
      exaggeration = 0.35 + 0.2 * i;
      break;
    case 'tension':
      rate = 1.0 - 0.05 * i;
      pitch = 1.0 + 0.04 * i;
      exaggeration = 0.55 + 0.3 * i;
      break;
    case 'anger':
      rate = 1.0 + 0.1 * i;
      volume = 1.0 + 0.1 * i;
      exaggeration = 0.6 + 0.35 * i;
      break;
    case 'calm':
      rate = 1.0 - 0.06 * i;
      exaggeration = 0.35;
      break;
    default:
      exaggeration = 0.5;
  }

  if (style === 'newscast') {
    rate = 1.0;
    pitch = 1.0;
    exaggeration = 0.3;
  } else if (style === 'animated') {
    rate = Math.min(1.15, rate + 0.05);
    exaggeration = Math.min(0.95, exaggeration + 0.15);
  } else if (style === 'conversational') {
    exaggeration = Math.min(0.85, exaggeration + 0.05);
  }

  return { rate, pitch, volume, exaggeration };
}

export function getCapability(engine: string): EngineCapability {
  return ENGINE_CAPABILITIES[engine] || ENGINE_CAPABILITIES.piper;
}

/**
 * Degradation matrix: feature × engine → 'native' | 'approx' | 'drop'
 */
export function degradationMatrix(): Record<
  string,
  Record<string, 'native' | 'approx' | 'drop'>
> {
  const features = [
    'style',
    'emotion',
    'emphasis',
    'breath',
    'sigh',
    'laugh',
    'pause',
    'cloning',
  ];
  const engines = Object.keys(ENGINE_CAPABILITIES);
  const out: Record<string, Record<string, 'native' | 'approx' | 'drop'>> = {};
  for (const f of features) {
    out[f] = {};
    for (const e of engines) {
      const cap = ENGINE_CAPABILITIES[e];
      if (f === 'cloning') {
        out[f][e] = cap.cloning ? 'native' : 'drop';
      } else if (f === 'style' || f === 'emotion' || f === 'emphasis') {
        out[f][e] = cap.emotionControl
          ? 'native'
          : cap.rateControl || cap.pitchControl
            ? 'approx'
            : 'drop';
      } else if (['breath', 'sigh', 'laugh', 'pause'].includes(f)) {
        if (f === 'pause') {
          out[f][e] = 'approx'; // always can insert silence
        } else {
          out[f][e] = cap.paralinguisticTags
            ? 'native'
            : f === 'breath' || f === 'sigh'
              ? 'approx'
              : 'drop';
        }
      } else {
        out[f][e] = 'drop';
      }
    }
  }
  return out;
}

export function compileRem(
  input: string | RemDocument,
  engine: string,
): CompileResult {
  const doc: RemDocument =
    typeof input === 'string' ? parseRem(input) : input;
  const cap = getCapability(engine);
  const warnings = [...(doc.warnings || [])];
  let degraded = false;

  let style = doc.style;
  let emotion = doc.emotion;
  let intensity = doc.intensity ?? 0.5;
  const segments: CompiledSegment[] = [];

  let textBuf = '';
  let nativePrefix = '';
  const assemblyEvents: NonNullable<CompiledSegment['assemblyEvents']> = [];

  const flush = () => {
    const speakable = textBuf.replace(/\s+/g, ' ').trim();
    if (!speakable && !nativePrefix && !assemblyEvents.length) {
      textBuf = '';
      return;
    }
    const prosody = emotionToProsody(emotion, intensity, style);
    const seg: CompiledSegment = {
      text: (nativePrefix + ' ' + speakable).trim(),
      speakable,
      ...prosody,
      emotion,
      intensity,
      style,
      nativePrefix: nativePrefix || undefined,
      assemblyEvents: assemblyEvents.length ? [...assemblyEvents] : undefined,
      warnings: [],
    };
    if (hasLiteralTagLeak(seg.speakable)) {
      seg.speakable = stripRemToPlain(seg.speakable);
      seg.warnings.push('stripped residual tag leak from speakable');
      warnings.push('stripped residual tag leak');
    }
    // Final guard: never put native tags into speakable
    if (hasLiteralTagLeak(seg.text) && !cap.paralinguisticTags) {
      seg.text = seg.speakable;
    }
    if (!cap.paralinguisticTags && nativePrefix) {
      // tags not supported — already moved to assembly or dropped
      seg.text = seg.speakable;
      seg.nativePrefix = undefined;
    }
    segments.push(seg);
    textBuf = '';
    nativePrefix = '';
    assemblyEvents.length = 0;
  };

  for (const node of doc.nodes) {
    handleNode(node);
  }
  flush();

  function handleNode(node: RemNode) {
    switch (node.kind) {
      case 'style':
        flush();
        style = node.style;
        if (!cap.emotionControl && !cap.rateControl) {
          degraded = true;
          warnings.push(`style dropped on ${engine}`);
        } else if (!cap.emotionControl) {
          degraded = true;
          warnings.push(`style approximated via rate on ${engine}`);
        }
        break;
      case 'emotion':
        flush();
        emotion = node.emotion;
        intensity = node.intensity;
        if (!cap.emotionControl) {
          degraded = true;
          warnings.push(
            cap.rateControl
              ? `emotion approximated via rate/pitch on ${engine}`
              : `emotion dropped on ${engine}`,
          );
        }
        break;
      case 'emphasis':
        // wrap with slight rate dip simulation by uppercase for non-SSML engines — better: leave text
        textBuf += node.text;
        if (!cap.emotionControl) {
          degraded = true;
          warnings.push(`emphasis approximated on ${engine}`);
        }
        break;
      case 'paralinguistic': {
        const ev = node.event;
        if (ev === 'pause') {
          assemblyEvents.push({ type: 'pause', ms: node.ms ?? 400 });
          break;
        }
        const native = cap.nativeTags?.[ev];
        if (cap.paralinguisticTags && native) {
          nativePrefix += (nativePrefix ? ' ' : '') + native;
        } else if (ev === 'breath' || ev === 'sigh') {
          // assembly-level breath sample
          assemblyEvents.push({ type: ev === 'sigh' ? 'sigh' : 'breath', gainDb: -24 });
          degraded = true;
          warnings.push(`${ev} approximated as sample mix on ${engine}`);
        } else {
          degraded = true;
          warnings.push(`${ev} dropped on ${engine} (not spoken)`);
          // CRITICAL: do not append event name to textBuf
        }
        break;
      }
      case 'character':
        flush();
        textBuf += node.text;
        break;
      case 'text':
        textBuf += node.text;
        break;
    }
  }

  // Empty input → empty segments
  if (!segments.length && stripRemToPlain(typeof input === 'string' ? input : '')) {
    const plain = stripRemToPlain(typeof input === 'string' ? input : '');
    segments.push({
      text: plain,
      speakable: plain,
      ...emotionToProsody(emotion, intensity, style),
      warnings: [],
    });
  }

  // Global leak check
  for (const seg of segments) {
    if (hasLiteralTagLeak(seg.speakable)) {
      seg.speakable = stripRemToPlain(seg.speakable);
      seg.text = cap.paralinguisticTags ? seg.text : seg.speakable;
      warnings.push('post-pass tag leak removed');
    }
  }

  return { segments, warnings, degraded };
}

/** Compile plain text (no REM) — identity path. */
export function compilePlain(text: string, _engine: string): CompileResult {
  const speakable = text;
  if (hasLiteralTagLeak(speakable)) {
    // Even plain path: strip accidental tags
    const cleaned = stripRemToPlain(speakable);
    return {
      segments: [{ text: cleaned, speakable: cleaned, warnings: ['stripped tags from plain'] }],
      warnings: ['stripped tags from plain'],
      degraded: false,
    };
  }
  return {
    segments: [{ text: speakable, speakable, warnings: [] }],
    warnings: [],
    degraded: false,
  };
}
