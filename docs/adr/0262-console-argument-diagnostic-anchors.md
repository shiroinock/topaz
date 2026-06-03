# 0262 - console argument diagnostic anchors

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0261](./0261-operator-fallback-diagnostic-anchors.md) advanced the self-host
probe to `src/codegen.ts:7916:9`. `checkConsoleCallArgs` already normalized the
console arity diagnostic to a `{ pos }` anchor, but unsupported argument-type
diagnostics still passed the full argument expression to `CodegenError`. Under
the exact structural subset, those full expression union shapes should not be
required when the diagnostic only needs a source position.

## Decision

Preserve the console builtin subset and normalize unsupported console argument
diagnostics to the explicit argument-position anchor `{ pos: arg.pos }`.
Rejected alternatives: broadening `CodegenError` to accept every expression
shape was rejected because the diagnostic contract only needs source position;
changing console formatting or accepted value types was rejected as a runtime
behavior change; sweeping all call-expression diagnostics was rejected as too
broad for this reached blocker.

## Implementation

- `src/codegen.ts:7916`: `undefined` and union console argument diagnostics use
  an inline `{ pos: arg.pos }` anchor while keeping the narrowing hint
  unchanged.
- `src/codegen.ts:7922`: `unknown` console argument diagnostics use the same
  inline anchor and keep the `instanceof` narrowing hint.
- `src/codegen.ts:7927`: reference and interface console argument diagnostics
  also use an inline position anchor.

## Consequences

- **Accepted**: `console.log` and `console.error` still accept the same scalar
  argument types and lower through the existing runtime paths.
- **Rejected**: `undefined`, union, `unknown`, reference, and interface values
  remain unsupported for console output.
- **Regression**: no examples were added because observable behavior and
  diagnostic messages are unchanged; build, self-host probe, and smoke tests
  remain the guard.
- **Self-host**: the old `src/codegen.ts:7916:9` anchor-shape blocker is
  removed. The next blocker is recorded in the phase outcome JSON.
- **Scope out**: broader call-expression diagnostic-anchor cleanup remains for
  later phases.
