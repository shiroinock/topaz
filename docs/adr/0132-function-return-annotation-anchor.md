# 0132. function return annotation anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0131](./0131-generic-function-type-parameter-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:2143`, where top-level function registration
passed the full `FunctionDecl` as the fallback anchor for return type annotation
resolution. The annotation code only needs `{ pos: number }`.

## Decision

Reuse the existing function registration `fnAnchor: { pos: number }` when
calling `typeFromAnnotation` for a top-level function return type.

Rejected alternative: passing full AST declarations through annotation helpers
would keep introducing EXACT object type mismatches in the self-host path.

## Implementation

- `src/codegen.ts:2143` passes `fnAnchor` to `typeFromAnnotation` for the return
  annotation fallback anchor.

## Consequences

- **Accepted**: top-level function return annotation diagnostics use the same
  minimal function anchor as nearby registration diagnostics.
- **Rejected**: no annotation helper widening is introduced.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
