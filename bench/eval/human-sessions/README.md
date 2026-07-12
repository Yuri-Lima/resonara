# Human Gate 2 CMOS sessions

Place downloaded eval-lab ledgers here as `*.jsonl`.

Requirements for certification (`scripts/gate2-status.js`):

- Protocol: human CMOS from `ui/eval-lab` (entries with A/B systems piper + expressive)
- n ≥ 4 non-anchor expressive-vs-piper scores
- Identical-anchor trial with |cmosAb| ≤ 1
- Ledger written **before** unblinding (eval-lab does this)

Then:

```bash
npm run eval:gate2:status
```

Empty directory ⇒ Gate 2 is **NOT_CERTIFIED_AWAITING_HUMAN_PANEL**.
