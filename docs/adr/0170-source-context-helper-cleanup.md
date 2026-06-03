# 0170. source context helper cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0169](./0169-interface-vtable-explicit-tail-check.md) moved the full graph
self-host probe to `src/codegen.ts:3531`, where `typeErr` used `if (!module)`
on `this.currentTypeModule`. The adjacent `withSfVoid`, `withSfString`, and
`withSfFunctionSig` helpers used `try/finally` to restore
`g_currentModule` / `currentTypeModule`. Topaz intentionally keeps `finally`
unsupported for now, and earlier cleanup ADRs established normal-path restore
for compiler state.

## Decision

Use `module === undefined` in `typeErr`. Remove `try/finally` from the
`withSf*` helpers, run the callback directly, and restore source-module state
on the normal path after the callback returns. Helpers with return values store
the result in a local before restoring.

Rejected alternative: adding `finally` lowering or truthy optional narrowing is
broader language work and unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:3531` checks `module === undefined`.
- `src/codegen.ts:3545` through `src/codegen.ts:3549` restore `withSfVoid`
  state on the normal path.
- `src/codegen.ts:3558` through `src/codegen.ts:3563` restore `withSfString`
  state after storing the callback result.
- `src/codegen.ts:3571` through `src/codegen.ts:3576` restore
  `withSfFunctionSig` state after storing the callback result.

## Consequences

- **Accepted**: source context helpers avoid `finally` in compiler source.
- **Accepted**: thrown codegen errors still abort the current compile.
- **Rejected**: no `finally` support or truthy optional narrowing is added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
