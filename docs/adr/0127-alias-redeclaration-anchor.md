# 0127. alias redeclaration anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0126](./0126-alias-interface-collision-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:2063`, where the type alias registration pass
passed a type alias declaration directly to `CodegenError` for redeclarations.
The constructor accepts the exact anchor shape `{ pos: number }`, and Topaz exact
object matching rejects the richer type alias declaration object.

## Decision

Reuse the explicitly annotated `{ pos: number }` alias anchor for the type alias
redeclaration diagnostic.

Rejected alternative: broadening `CodegenError` to accept full type alias
declaration objects would be larger than this local compiler-source cleanup and
would not improve diagnostic behavior.

## Implementation

- `src/codegen.ts:2063` passes `aliasAnchor` to `CodegenError`.

## Consequences

- **Accepted**: diagnostics keep the same type alias declaration position.
- **Accepted**: exact object matching no longer rejects this diagnostic path.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
