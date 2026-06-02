# 0120. generic class implements anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0119](./0119-class-type-parameter-duplicate-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:1993`, where the generic class registration
pass passed a class declaration directly to `CodegenError` for the implements
rejection diagnostic. The constructor accepts the exact anchor shape
`{ pos: number }`, and Topaz exact object matching rejects the richer class
declaration object.

## Decision

Reuse the explicitly annotated `{ pos: number }` class anchor for the generic
class implements rejection diagnostic.

Rejected alternative: broadening `CodegenError` to accept full class declaration
objects would be larger than this local compiler-source cleanup and would not
improve diagnostic behavior.

## Implementation

- `src/codegen.ts:1993` passes `clsAnchor` to `CodegenError`.

## Consequences

- **Accepted**: diagnostics keep the same class declaration position.
- **Accepted**: exact object matching no longer rejects this diagnostic path.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
