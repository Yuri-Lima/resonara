/** Embedded campaign data for the Human-Voice Frontier dashboard. */
window.RESONARA_EXPRESSIVE = {
  version: '2.1.0-expressive',
  gate2: {
    cmos: 1.0,
    n: 4,
    ci95: [0.25, 1.75],
    anchorSanity: 'pass',
    protocol: 'CMOS-blind-v1-affect-fitness',
    ledger: 'bench/eval/gate2-ledger.jsonl',
    detail: 'death +2, picnic +2, dialogue 0, newscast 0 (content-type routing)',
  },
  landscape: [
    { name: 'Chatterbox Turbo', code: 'MIT', weights: 'MIT', params: '350M', ptBR: 'pack', controls: 'tags+exagg', ship: true, bench: true, score: 9.1 },
    { name: 'Orpheus 3B', code: 'Apache-2.0', weights: 'Apache-2.0', params: '3B', ptBR: 'weak', controls: 'trained tags', ship: true, bench: true, score: 7.4 },
    { name: 'Dia 1.6B', code: 'Apache-2.0', weights: 'Apache-2.0', params: '1.6B', ptBR: 'no', controls: 'dialogue tags', ship: true, bench: true, score: 6.8 },
    { name: 'CosyVoice2', code: 'Apache-2.0', weights: 'Apache-2.0', params: '0.5B', ptBR: 'TBD', controls: 'instruct', ship: true, bench: true, score: 7.0 },
    { name: 'Qwen3-TTS 0.6B', code: 'Apache-2.0', weights: 'Apache-2.0', params: '0.6B', ptBR: 'yes', controls: 'NL direction', ship: true, bench: true, score: 7.6 },
    { name: 'Kokoro 82M', code: 'Apache-2.0', weights: 'Apache-2.0', params: '82M', ptBR: 'limited', controls: 'none', ship: true, bench: false, score: 5.0 },
    { name: 'F5-TTS', code: 'MIT', weights: 'CC-BY-NC-4.0', params: '~0.3B', ptBR: 'multi', controls: 'clone', ship: false, bench: false, score: 0, dq: 'CC-BY-NC weights' },
    { name: 'StyleTTS2', code: 'MIT', weights: 'custom terms', params: 'multi', ptBR: 'no', controls: 'style diffusion', ship: false, bench: false, score: 0, dq: 'weight terms + GPL phonemizer' },
  ],
  winner: 'Chatterbox Turbo (Resemble AI)',
  runnerUp: 'Qwen3-TTS 0.6B CustomVoice',
  prosody: {
    // Measured 2026-07-12 on this machine (librosa pyin)
    piper: {
      death: { f0Var: 2318.85, f0Mean: 190.84, diversity: 924.99 },
      picnic: { f0Var: 2300.72, f0Mean: 195.7, diversity: 1069.16 },
      affectDeltaHz: 4.86,
    },
    expressive: {
      // Directed final = Chatterbox + humanization (pitch/rate/EQ by affect)
      death: { f0Var: 520, f0Mean: 161.2, diversity: 140 },
      picnic: { f0Var: 560, f0Mean: 206.3, diversity: 280 },
      affectDeltaHz: 45.1,
    },
  },
  degradation: {
    features: ['style', 'emotion', 'emphasis', 'breath', 'laugh', 'pause', 'cloning'],
    engines: ['expressive', 'kokoro', 'piper', 'platform'],
    matrix: {
      style: { expressive: 'native', kokoro: 'approx', piper: 'approx', platform: 'approx' },
      emotion: { expressive: 'native', kokoro: 'approx', piper: 'approx', platform: 'approx' },
      emphasis: { expressive: 'native', kokoro: 'approx', piper: 'approx', platform: 'approx' },
      breath: { expressive: 'native', kokoro: 'approx', piper: 'approx', platform: 'approx' },
      laugh: { expressive: 'native', kokoro: 'drop', piper: 'drop', platform: 'drop' },
      pause: { expressive: 'approx', kokoro: 'approx', piper: 'approx', platform: 'approx' },
      cloning: { expressive: 'native*', kokoro: 'drop', piper: 'drop', platform: 'drop' },
    },
  },
  casting: [
    { character: 'narrator', voice: 'expressive:chatterbox-turbo', style: 'narrative' },
    { character: 'mara', voice: 'expressive:chatterbox-turbo', style: 'conversational', note: 'whisper path' },
    { character: 'jon', voice: 'kokoro:am_adam', style: 'conversational', note: 'shout path' },
  ],
  contentDefaults: {
    drama: 'expressive',
    comedy: 'expressive',
    news: 'piper',
    children: 'expressive',
    dialogue: 'expressive',
    longform: 'expressive',
    interactivePreview: 'kokoro',
  },
};
