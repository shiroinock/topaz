# 0123. interface redeclaration anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0122](./0122-interface-class-collision-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:2029`, where the interface registration pass
passed an interface declaration directly to `CodegenError` for redeclarations.
The constructor accepts the exact anchor shape `{ pos: number }`, and Topaz exact
object matching rejects the richer interface declaration object.

## Decision

Reuse the explicitly annotated `{ pos: number }` interface anchor for the
interface redeclaration diagnostic.

Rejected alternative: broadening `CodegenError` to accept full interface
declaration objects would be larger than this local compiler-source cleanup and
would not improve diagnostic behavior.

## Implementation

- `src/codegen.ts:2029` passes `ifaceAnchor` to `CodegenError`.

## Consequences

- **Accepted**: diagnostics keep the same interface declaration position.
- **Accepted**: exact object matching no longer rejects this diagnostic path.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
