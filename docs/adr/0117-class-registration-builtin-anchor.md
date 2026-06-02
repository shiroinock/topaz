# 0117. class registration builtin anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0116](./0116-source-files-index-no-bang.md) moved the full graph self-host
probe to `src/codegen.ts:1972`, where the class registration pass passed a class
declaration directly to `CodegenError`. The constructor accepts the exact anchor
shape `{ pos: number }`, and Topaz exact object matching rejects the richer class
declaration object.

## Decision

Create an explicitly annotated `{ pos: number }` anchor from `cls.pos` in the
class registration pass and pass that anchor to the built-in redefinition
diagnostic.

Rejected alternative: broadening `CodegenError` to accept full class declaration
objects would be larger than this local compiler-source cleanup and would not
improve diagnostic behavior.

## Implementation

- `src/codegen.ts:1971` creates `clsAnchor`.
- `src/codegen.ts:1972` passes `clsAnchor` to `CodegenError`.

## Consequences

- **Accepted**: diagnostics keep the same class declaration position.
- **Accepted**: exact object matching no longer rejects this diagnostic path.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
