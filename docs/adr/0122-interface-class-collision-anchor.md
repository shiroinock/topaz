# 0122. interface class collision anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0121](./0121-interface-registration-builtin-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:2026`, where the interface registration pass
passed an interface declaration directly to `CodegenError` for class name
collisions. The constructor accepts the exact anchor shape `{ pos: number }`,
and Topaz exact object matching rejects the richer interface declaration object.

## Decision

Reuse the explicitly annotated `{ pos: number }` interface anchor for the
interface/class name collision diagnostic.

Rejected alternative: broadening `CodegenError` to accept full interface
declaration objects would be larger than this local compiler-source cleanup and
would not improve diagnostic behavior.

## Implementation

- `src/codegen.ts:2026` passes `ifaceAnchor` to `CodegenError`.

## Consequences

- **Accepted**: diagnostics keep the same interface declaration position.
- **Accepted**: exact object matching no longer rejects this diagnostic path.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
