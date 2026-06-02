# 0056. makeUnion single-variant non-null cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0055](./0055-internal-codegen-error-helper.md) moved the full graph
self-host probe to `src/codegen.ts:336`, where `makeUnion` returned
`sorted[0]!` after a `sorted.length === 1` guard. Topaz array indexing returns
the element type directly, so the non-null assertion is redundant and rejected.

## Decision

Return `sorted[0]` directly in the single-variant path. The preceding empty
and length-one checks still preserve the same control-flow invariant.

Rejected alternatives: changing array indexing to return `T | undefined` is a
broad language/runtime decision; allowing redundant non-null assertions would
weaken a correct subset check.

## Implementation

- `src/codegen.ts:336` removes the non-null assertion from the single-variant
  `makeUnion` return.

## Consequences

- **Accepted**: `makeUnion` behavior is unchanged.
- **Rejected**: array indexing and non-null assertion rules are unchanged.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
