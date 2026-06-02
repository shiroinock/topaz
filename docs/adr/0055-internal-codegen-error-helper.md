# 0055. internal CodegenError helper (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0054](./0054-make-union-manual-sort.md) moved the full graph self-host probe
to `src/codegen.ts:335`, where `makeUnion` threw a plain JavaScript
`new Error`. Topaz throw values are class instances, and `Error` is not a
supported builtin class in the compiler subset.

## Decision

Introduce `throwInternalCodegenError(message)` as the local way to throw an
internal formatted `CodegenError`, then use it for the empty `makeUnion`
invariant. This preserves a class-instance throw without adding JavaScript
`Error` support.

Rejected alternatives: adding a builtin `Error` class would widen runtime
semantics for an internal compiler invariant; silently accepting an empty union
would hide a caller bug.

## Implementation

- `src/codegen.ts:335` now calls `throwInternalCodegenError`.
- `src/codegen.ts:664` adds the helper, implemented through the existing
  `FormattedCodegenError` wrapper.

## Consequences

- **Accepted**: empty `makeUnion` still fails with a formatted codegen error.
- **Rejected**: no JavaScript `Error` builtin is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
