# 0119. class type parameter duplicate anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0118](./0118-class-registration-redeclaration-anchor.md) moved the full graph
self-host probe to `src/codegen.ts:1986`, where the class registration pass
passed a type parameter declaration directly to `CodegenError`. The constructor
accepts the exact anchor shape `{ pos: number }`, and Topaz exact object matching
rejects the richer type parameter declaration object.

## Decision

Create an explicitly annotated `{ pos: number }` anchor from `tp.pos` in the
duplicate type parameter check and pass that anchor to `CodegenError`.

Rejected alternative: broadening `CodegenError` to accept full type parameter
objects would be larger than this local compiler-source cleanup and would not
improve diagnostic behavior.

## Implementation

- `src/codegen.ts:1985` creates `tpAnchor`.
- `src/codegen.ts:1986` passes `tpAnchor` to `CodegenError`.

## Consequences

- **Accepted**: diagnostics keep the same type parameter position.
- **Accepted**: exact object matching no longer rejects this diagnostic path.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
