# Probe: Watch folder

**Verdict:** WORKING  
**Fix estimate:** S  
**Timestamp:** 2026-07-11T22:16:33.190Z

## Evidence

```
watch daemon pid=87119

dropped /private/tmp/trace-swe23-20260712-000916/reports/probes/fixtures/watch-in/watch-probe.txt

outDir=["watch-probe.wav"] watchDir=["watch-probe.txt","watch-probe.txt.done"]

killed process group -87119

daemon terminated (orphan check OK)
```

## Gaps

- (none)

## Structured

```json
{
  "feature": "Watch folder",
  "verdict": "WORKING",
  "gaps": [],
  "fixEstimate": "S"
}
```
