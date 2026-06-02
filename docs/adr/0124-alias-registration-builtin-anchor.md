# 0124. alias registration builtin anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0123](./0123-interface-redeclaration-anchor.md) moved the full graph self-host
probe to `src/codegen.ts:2053`, where the type alias registration pass passed a
type alias declaration directly to `CodegenError`. The constructor accepts the
exact anchor shape `{ pos: number }`, and Topaz exact object matching rejects the
richer type alias declaration object.

## Decision

Create an explicitly annotated `{ pos: number }` anchor from `alias.pos` in the
type alias registration pass and pass that anchor to the built-in redefinition
diagnostic.

Rejected alternative: broadening `CodegenError` to accept full type alias
declaration objects would be larger than this local compiler-source cleanup and
would not improve diagnostic behavior.

## Implementation

- `src/codegen.ts:2052` creates `aliasAnchor`.
- `src/codegen.ts:2053` passes `aliasAnchor` to `CodegenError`.

## Consequences

- **Accepted**: diagnostics keep the same type alias declaration position.
- **Accepted**: exact object matching no longer rejects this diagnostic path.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
