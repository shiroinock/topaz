# 0079. Scope barrier depth indexed read cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0078](./0078-scope-pop-parent-local-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:738`, where `Scope.lookup()` used a non-null
assertion after reading the last `barrierDepths` element. `lookupBase()` had the
same pattern. Topaz array indexing returns the element type directly, so these
assertions are redundant and rejected.

## Decision

Read the last `barrierDepths` element directly in both `lookup` and
`lookupBase`, preserving the existing `length > 0` guard.

Rejected alternatives: changing array indexing to return `T | undefined` is a
broad language/runtime decision; allowing redundant non-null assertions would
weaken the existing subset check.

## Implementation

- `src/codegen.ts:738` removes the non-null assertion from `lookup`'s barrier
  floor read.
- `src/codegen.ts:761` removes the non-null assertion from `lookupBase`'s
  barrier floor read.

## Consequences

- **Accepted**: scope barrier behavior is unchanged.
- **Rejected**: array indexing and non-null assertion rules are unchanged.
- **Regression**: no new example was added because existing closure, arrow, and
  narrowing tests cover behavior, and the full graph self-host probe covers
  this compiler-source cleanup.
