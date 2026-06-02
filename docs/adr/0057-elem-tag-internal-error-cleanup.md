# 0057. elemTag internal error cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0056](./0056-make-union-single-variant-non-null-cleanup.md) moved the full
graph self-host probe to `src/codegen.ts:365`, where `elemTag` used plain
JavaScript `new Error` for internal container-element invariants. Topaz throw
values are class instances, and `Error` is not a supported builtin class in the
compiler subset.

## Decision

Use the existing `throwInternalCodegenError` helper for all `elemTag` internal
invariant failures. This keeps the helper's caller surface narrow while
avoiding repeated self-host stops inside the same helper.

Rejected alternatives: adding a builtin `Error` class would widen runtime
semantics for internal compiler invariants; converting these to user-anchored
`CodegenError` diagnostics would require an anchor that `elemTag` does not
receive.

## Implementation

- `src/codegen.ts:365` replaces the bare-undefined container rejection with
  `throwInternalCodegenError`.
- `src/codegen.ts:368` replaces the union container rejection with the same
  helper.
- `src/codegen.ts:378` replaces the iterator container rejection with the same
  helper.
- `src/codegen.ts:380` replaces the fallback unsupported element-kind invariant
  with the same helper.

## Consequences

- **Accepted**: `elemTag` rejection behavior is unchanged.
- **Rejected**: no JavaScript `Error` builtin is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
