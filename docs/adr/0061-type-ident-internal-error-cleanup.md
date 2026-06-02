# 0061. typeIdent internal error cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0060](./0060-dunion-type-ident-manual-sort.md) moved the full graph
self-host probe to `src/codegen.ts:463`, where `typeIdent` used a plain
JavaScript `new Error` for its fallback invariant. Topaz throw values are class
instances, and `Error` is not a supported builtin class in the compiler subset.

## Decision

Use `throwInternalCodegenError` for the `typeIdent` fallback. This keeps the
internal failure explicit without adding JavaScript `Error` support.

Rejected alternatives: adding a builtin `Error` class would widen runtime
semantics for an internal compiler invariant; silently returning a placeholder
identifier would hide a type-shape bug.

## Implementation

- `src/codegen.ts:463` replaces the fallback plain `Error` with
  `throwInternalCodegenError`.

## Consequences

- **Accepted**: unsupported type shapes still fail.
- **Rejected**: no JavaScript `Error` builtin is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
