# 0111. local function signature without non-null assertion (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0110](./0110-resolve-function-sig-explicit-module-check.md) moved the full
graph self-host probe to `src/codegen.ts:1933`, where `resolveFunctionSig` used
`local[0]!`. Topaz array access currently returns the element type, so the
non-null assertion is rejected because the operand is not optional.

## Decision

Remove the non-null assertion from the single local signature return path. The
preceding `local.length === 1` check preserves the runtime invariant, and this
change aligns the compiler source with the current array access type.

Rejected alternative: changing array access to return `T | undefined` remains a
language-wide decision and is out of scope for this self-hosting cleanup.

## Implementation

- `src/codegen.ts:1933` returns `local[0]` directly.

## Consequences

- **Accepted**: local signature lookup compiles under current Topaz array access
  typing.
- **Rejected**: no array access semantics are changed.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
