# 0065. zeroValueOfElem internal error cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0064](./0064-iter-container-tag-internal-error-cleanup.md) moved the full
graph self-host probe to `src/codegen.ts:618`, where `zeroValueOfElem` used a
plain JavaScript `new Error` for its fallback invariant. Topaz throw values are
class instances, and `Error` is not a supported builtin class in the compiler
subset.

## Decision

Use `throwInternalCodegenError` for the `zeroValueOfElem` fallback. This keeps
the unsupported element-shape failure explicit without adding JavaScript
`Error` support.

Rejected alternatives: adding a builtin `Error` class would widen runtime
semantics for an internal compiler invariant; returning an arbitrary zero value
would hide an unsupported element shape.

## Implementation

- `src/codegen.ts:618` replaces the fallback plain `Error` with
  `throwInternalCodegenError`.

## Consequences

- **Accepted**: unsupported zero-value element shapes still fail.
- **Rejected**: no JavaScript `Error` builtin is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
