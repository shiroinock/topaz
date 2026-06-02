# 0058. short-name internal error cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0057](./0057-elem-tag-internal-error-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:387`, where `scalarTag` used plain
JavaScript `new Error` for an internal type-shape invariant. The adjacent
container short-name helpers used the same pattern and would otherwise stop the
probe one helper at a time.

## Decision

Use `throwInternalCodegenError` for `scalarTag`, `arrayShortName`,
`mapShortName`, and `setShortName` invariant failures. This keeps these
helpers in the compiler subset without adding JavaScript `Error` support.

Rejected alternatives: adding a builtin `Error` class would widen runtime
semantics for internal compiler invariants; converting these to user-anchored
`CodegenError` diagnostics would require anchors that the short-name helpers do
not receive.

## Implementation

- `src/codegen.ts:387` replaces the scalar kind assertion's plain `Error`.
- `src/codegen.ts:397` replaces the array short-name assertion's plain
  `Error`.
- `src/codegen.ts:402` replaces the map short-name assertion's plain `Error`.
- `src/codegen.ts:407` replaces the set short-name assertion's plain `Error`.

## Consequences

- **Accepted**: short-name helper behavior is unchanged.
- **Rejected**: no JavaScript `Error` builtin is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
