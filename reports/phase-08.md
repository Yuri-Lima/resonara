# Phase 8 — Headers / chapters

## Behavior
- Standalone `#` / `##` / `###` chunks: `isHeader` + `endsAt` chapter|header
- Approach gap when next chunk is header (pre-header or chapter for H1)
- Header→body uses header/chapter band
- Pure `---` HR dropped (not spoken); single chapter gap at next H1
- Chapter timestamps use assembled timeline including inserted gaps

## Probe
en-structure / pt-br-estrutura: chapter 2000ms, header 1100ms, pre-header 325ms — **100%**

## Workstream ledger
| stream | purpose | outcome |
|---|---|---|
| structure fixtures | header/chapter bands | 100% both langs |
