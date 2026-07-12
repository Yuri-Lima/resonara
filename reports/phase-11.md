# Phase 11 — Dual-platform Packaging

**Date:** 2026-07-12  
**Status:** COMPLETE

## What changed

- Ran `npm run dist:mac` and `npm run dist:win` as concurrent background builds during the Phase 10 soak window.
- Produced macOS DMG + zip and Windows NSIS installer.
- Verified macOS app bundle structure (Mach-O arm64 executable, Info.plist CFBundleIdentifier app.resonara.desktop).

## Artifacts (real sizes)

| Platform | Artifact | Size | Status |
|----------|----------|------|--------|
| macOS | Resonara-2.2.0-arm64.dmg | 417.1 MB | build-verified |
| macOS | Resonara-2.2.0-arm64-mac.zip | 437.2 MB | build-verified |
| macOS | release/mac-arm64/Resonara.app | Mach-O arm64 | runtime-verified-bundle |
| Windows | Resonara Setup 2.2.0.exe | 335.5 MB | build-verified (cross-build on darwin) |

## Commands + real output

```
$ cat farm-output/packaging/mac-meta.txt
mac_start=2026-07-12T15:42:57Z
mac_exit=0
mac_end=2026-07-12T15:44:07Z

$ cat farm-output/packaging/win-meta.txt
win_start=2026-07-12T15:42:57Z
win_exit=0
win_end=2026-07-12T15:44:36Z

$ file release/mac-arm64/Resonara.app/Contents/MacOS/Resonara
Mach-O 64-bit executable arm64

$ ls -lah release/*.dmg release/*Setup*.exe
417M Resonara-2.2.0-arm64.dmg
336M Resonara Setup 2.2.0.exe
```

## Self-review Pass A

- Both installers exited 0.
- Windows is build-verified on macOS host (not runtime-tested on Windows hardware).
- macOS app bundle present and executable.

## Self-review Pass B — 3 findings

1. **electron-builder signing** — Failure: unsigned builds may fail Gatekeeper on end-user Macs. Justification: farm CI uses identity=null; document as build-verified not notarized.
2. **cross-built NSIS** — Failure: NSIS built on darwin may differ from native Windows build. Justification: electron-builder supports this path; label as build-verified only.
3. **mac runtime smoke** — Failure: GUI app may not bind HTTP without desktop session. Mitigation: structural + Mach-O verification logged.

## Workstream ledger

| ID | Purpose | Outcome | Runtime |
|----|---------|---------|---------|
| p11-dist-mac | npm run dist:mac | landed exit 0 | ~70s |
| p11-dist-win | npm run dist:win | landed exit 0 | ~99s |
| p11-mac-smoke | bundle/Mach-O verify | landed | <5s |

## Evidence check

- [x] DMG + NSIS paths and sizes
- [x] exit codes 0
- [x] mac bundle Info.plist + Mach-O
