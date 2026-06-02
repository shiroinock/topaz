# 0062. cTypeName internal error cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0061](./0061-type-ident-internal-error-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:526`, where `cTypeName` used plain
JavaScript `new Error` for internal type-shape invariants. Topaz throw values
are class instances, and `Error` is not a supported builtin class in the
compiler subset.

## Decision

Use `throwInternalCodegenError` for `cTypeName` invariant failures. This keeps
the value-type helper explicit while avoiding JavaScript `Error` support.

Rejected alternatives: adding a builtin `Error` class would widen runtime
semantics for internal compiler invariants; converting these to user-anchored
`CodegenError` diagnostics would require anchors that `cTypeName` does not
receive.

## Implementation

- `src/codegen.ts:526` replaces the bare-undefined C type invariant.
- `src/codegen.ts:536` replaces the `void` value-position invariant.
- `src/codegen.ts:553` replaces the unsupported union-shape invariant.
- `src/codegen.ts:565` replaces the unsupported `T | undefined` inner-type
  invariant.

## Consequences

- **Accepted**: `cTypeName` failure behavior remains explicit.
- **Rejected**: no JavaScript `Error` builtin is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
