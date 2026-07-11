# Phase 8 — RELEASE ENGINEERING

**Status:** COMPLETE

## Version

- `package.json` **2.0.0** (semver major — feature wave)

## Artifacts

| Artifact | Path / note |
|----------|-------------|
| CHANGELOG | `CHANGELOG.md` Keep-a-Changelog from PRs #2–#9 |
| Release notes | `docs/RELEASE_NOTES_v2.0.0.md` |
| Product page | `pages/index.html` (neural v2 reality) |
| Migration drill | `reports/migration-drill/{before,after}.json` |
| Stale branches | `reports/stale-branches.md` (advisory only) |
| macOS DMG | `release/Resonara-2.0.0-arm64.dmg` (~421 MB) |
| macOS zip | `release/Resonara-2.0.0-arm64-mac.zip` (~441 MB) |
| App bundle | `release/mac-arm64/Resonara.app` (~1.2 GB) |

### Bundled models (verified on disk)

```
…/Resources/piper/models/en_US-lessac-medium.onnx
…/Resources/piper/models/pt_BR-faber-medium.onnx
```

### Migration drill paste

**before (v1-era):** job without language/resume metadata  
**after (v2):** same job + `metadata.language`, `resumePositionMs`, optional chaining safe

## Installer verification (lite API parity smoke)

- Engines listed (piper/kokoro/platform available when tools present)
- en + pt-BR piper synthesis completed
- Library list + feeds list OK
- Windows: electron-builder NSIS config present; **build-verified / runtime smoke mac-only** (honest labeling)

## Workstream ledger

| Workstream | Outcome |
|------------|---------|
| dist:mac | landed DMG+zip |
| changelog + notes + pages | landed |
| migration drill | landed |
| stale-branch report | landed (no remote deletes) |

## Review Loop v2

Version bump + docs only after feature-truth WORKING. Packaging log: `reports/dist-mac.log`.
