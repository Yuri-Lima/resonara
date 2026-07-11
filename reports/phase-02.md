# Phase 2 — Baseline + Safety Net (G28)

**Tag:** `pre-g28` (local only)  
**HEAD at baseline:** after Phase 1 commit  

## Commands + real output

### npm install
```
added 1066 packages, and audited 1067 packages in 5s
31 vulnerabilities (3 low, 21 moderate, 7 high)
```
Deprecated: inflight, rimraf@2/3, eslint@8, multer@1.4.5-lts, fluent-ffmpeg, glob@7/10, uuid@9, boolean@3.2.0

### npm audit summary
31 vulnerabilities (3 low, 21 moderate, 7 high). Notable high: `tmp` path traversal (via nest cli/inquirer), express/qs chain. Full fix requires breaking Nest 11 upgrades.

### npm outdated (major drift)
Nest packages current 10.x / wanted 10.x / latest 11.x; eslint 8→10; jest 29→30; multer 1→2; file-type 16→22.

### npm run build
```
> resonara@2.0.0 build
> nest build
(exit 0, clean)
```

### npm test
```
Test Suites: 45 passed, 45 total
Tests:       1 skipped, 226 passed, 227 total
Time:        6.686 s
```

### eslint
```
✖ 8 problems (0 errors, 8 warnings)
```
Files: ffmpeg.service.ts (unused parts/m), create-take.dto.ts (IsObject), queue.module.ts (forwardRef), tracks.controller.ts (Header/path), tracks.service.ts (createWriteStream/pipeline).

### npm run test:cov (global thresholds)
```
All files | 77.38% stmts | 56.39% branch | 66.24% funcs | 79.57% lines
Jest: "global" coverage threshold for statements (80%) not met: 77.38%
Jest: "global" coverage threshold for lines (80%) not met: 79.57%
```
**FINDING B-01:** coverage thresholds fail (77.38/79.57 vs 80/80) — baseline debt, not a hard blocker for audit tooling.

### demo:quick
```
Demo: quick-sentence lang=en
engine: platform, words: 16, elapsedMs: 5676, duration: 7.50s
output: demo-output/quick-sentence.wav
```
GREEN.

### demo:all
See phase-02 completion note / log tail when finished (background during report draft).

## Hard blockers
None — build and unit tests green. Coverage threshold miss and 31 audit vulns are findings for MASTER_TODO, not blockers.

## Safety net
```
git tag pre-g28   # LOCAL ONLY
```

## Workstream ledger
| Stream | Purpose | Outcome | Runtime |
|--------|---------|---------|---------|
| npm install | deps | landed | 5s |
| build | compile | clean | ~3s |
| test | unit | 226 pass / 1 skip | 6.7s |
| eslint | lint | 0 err / 8 warn | ~5s |
| test:cov | coverage | 77.38% stmts (threshold fail) | 7s |
| demo:quick | smoke | green | ~6s |
| demo:all | full demos | background | TBD |

## Adversarial findings (3)
1. **coverage config / package.json jest thresholds:** suite "passes" under `npm test` but `test:cov` reports threshold failure — CI that only runs `npm test` silently accepts under-coverage. *Record as B-01; fix in marathon via more specs.*
2. **demo:quick used platform engine** not Piper/Kokoro — neural path not exercised by quick demo if models missing. *Justification for later: demo:all / neural-specific probes; record environment note.*
3. **package-lock.json dirtied by npm install** without intentional dep change — risk of accidental commit noise. *Resolution: leave unstaged unless intentional audit fixes touch deps.*

## Evidence check
All numbers above pasted from real command runs in this session (`/tmp/resonara-*.log`).

### demo:all (completed)
```
10 demos completed (en suite via --all --no-open)
Wrote demo-output/report.json
Exit 0 after ~474s
All samples green with platform engine (Albert)
```

### pre-g28 tag
```
$ git tag -f pre-g28
pre-g28 (local only, never pushed)
```

### FINDINGS from baseline (seed MASTER_TODO)
- B-01: coverage thresholds fail (77.38% stmts / 79.57% lines vs 80%)
- B-02: 31 npm audit vulns (7 high) — mostly transitive Nest CLI
- B-03: 8 eslint unused-var warnings
- B-04: orphan `node dist/main.js` PID 26414 on :3847 (~40 min) killed during audit

## REVIEW LOOP v2
1. BUILD: clean
2. TEST: 226 pass / 1 skip
3. LINT: 0 errors / 8 warnings
4. Correctness: phase report documents real numbers only
5. Adversarial (already in draft above)
6. Evidence: /tmp/resonara-*.log
7. This report
8. Commit phase-02
