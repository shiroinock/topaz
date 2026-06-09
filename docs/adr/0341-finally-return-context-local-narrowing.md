# 0341 - finally return context local narrowing

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.13

## Context

After [0340](./0340-array-spread-element-coercion.md), the self-host probe
advanced to `src/codegen.ts:5609:27`. The `try/finally` return cleanup path
read `this.finallyReturnContext` and its `returnVar` property through optional
locals, then interpolated those values directly into a template literal. Topaz
does not yet carry every `string | undefined` proof through this property path
and template substitution, so the compiler source itself had to be written in a
more explicit subset shape.

## Decision

Bind the guarded `finallyReturnContext` to a `FinallyReturnContext` local and
bind nullable string properties inside positive narrowing blocks before using
them in generated C snippets. Rejected alternatives: teaching template literal
substitution to accept `string | undefined` was rejected because it would hide a
real unchecked optional value; adding broader property-flow narrowing was
rejected as larger than the current self-host blocker; rewriting the
`try/finally` lowering was rejected because the runtime behavior is already the
right one.

## Implementation

- `src/codegen.ts:5584` narrows the bare-return cleanup context before reading
  `reasonVar`, `cleanupLabel`, and `outerLiveTryFrames`.
- `src/codegen.ts:5605` narrows the value-return cleanup context before reading
  `returnVar`.
- `src/codegen.ts:5609` keeps `returnVar` use inside the positive
  `!== undefined` branch so Topaz can see the value as `string`.
- `MEMO.md:267` records the next current self-host blocker.

## Consequences

- **Accepted**: the previous self-host blocker at `src/codegen.ts:5609:27` is
  cleared without changing generated C behavior.
- **Accepted**: this keeps optional values out of template literal
  substitutions unless they have been explicitly narrowed.
- **Current blocker**: `pnpm run test:selfhost` now advances to
  `src/codegen.ts:5817:16`, where `lines.push(...this.emitCatchBindingLines(...))`
  uses call-argument spread.
- **Regression**: no standalone example was added because this is a compiler
  source cleanup; the self-host probe is the regression surface.
