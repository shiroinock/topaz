# 0063. cTypeName indexed non-null cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0062](./0062-ctype-name-internal-error-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:555`, where `cTypeName` used `nonUndef[0]!`
after checking `nonUndef.length === 1`. Topaz array indexing returns the
element type directly, so the non-null assertion is redundant and rejected.

## Decision

Read `nonUndef[0]` directly after the existing length guard. This preserves the
same invariant while staying within the subset's non-null assertion rules.

Rejected alternatives: changing array indexing to return `T | undefined` is a
broad language/runtime decision; allowing redundant non-null assertions would
weaken a correct subset check.

## Implementation

- `src/codegen.ts:555` removes the non-null assertion from the `cTypeName`
  union inner-type read.

## Consequences

- **Accepted**: `cTypeName` behavior is unchanged.
- **Rejected**: array indexing and non-null assertion rules are unchanged.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
