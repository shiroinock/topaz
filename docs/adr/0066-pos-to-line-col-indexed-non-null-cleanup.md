# 0066. posToLineCol indexed non-null cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0065](./0065-zero-value-internal-error-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:647`, where `posToLineCol` used non-null
assertions after array indexed reads. Topaz array indexing returns the element
type directly, so these assertions are redundant and rejected.

## Decision

Read `starts[mid]` and `starts[line]` directly. The binary search invariants
already ensure those indexes are in range.

Rejected alternatives: changing array indexing to return `T | undefined` is a
broad language/runtime decision; allowing redundant non-null assertions would
weaken a correct subset check.

## Implementation

- `src/codegen.ts:647` removes the non-null assertion from the midpoint read.
- `src/codegen.ts:654` removes the non-null assertion from the final line-start
  read.

## Consequences

- **Accepted**: diagnostic line/column calculation is unchanged.
- **Rejected**: array indexing and non-null assertion rules are unchanged.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
