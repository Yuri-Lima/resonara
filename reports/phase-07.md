# Phase 7 Report — REM Expression Markup

## Build/test/lint
`npm test` includes rem-parser.spec (literal-tag leak guards). Build clean.

## Delivered
- rem.types.ts, rem-parser.ts, rem-compiler.ts, rem-parser.spec.ts
- EXPRESSION_MARKUP.md degradation matrix
- Zero literal-tag leaks: hasLiteralTagLeak + stripRemToPlain in compile path

## Adversarial (3)
1. compileRem flattens multi-segment for long-form jobs currently — assembly of native tags needs segment loop in synthesize (Phase 14 partial).
2. orpheus capability block remains for future runner-up swap — dead path until swap.
3. intensity default 0.5 may under-direct grief — auto-direction overrides.

## Workstream: rem unit tests landed.
