# 0068. requiredParamCount indexed non-null cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0067](./0067-unsupported-anchor-shape.md) moved the full graph self-host probe
to `src/codegen.ts:821`, where `requiredParamCount` used `params[n - 1]!` after
guarding `n > 0`. Topaz array indexing returns the element type directly, so
the non-null assertion is redundant and rejected.

## Decision

Read `params[n - 1]` directly inside the existing loop guard.

Rejected alternatives: changing array indexing to return `T | undefined` is a
broad language/runtime decision; allowing redundant non-null assertions would
weaken a correct subset check.

## Implementation

- `src/codegen.ts:821` removes the non-null assertion from the indexed
  parameter read.

## Consequences

- **Accepted**: optional-parameter arity behavior is unchanged.
- **Rejected**: array indexing and non-null assertion rules are unchanged.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
