# Phase 11 — Config surfaces

## Exposed
- API: `pauseProfile: audiobook|podcast|news|custom` on TTS job body
- CLI: `--pause-profile`
- Profiles: `src/tts/pause/pause-profiles.ts` + pt-BR overrides
- Job entity persists pause metadata on chunk map (`endsAt`, `isHeader`)

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| controller + CLI wire | profile param | landed |
