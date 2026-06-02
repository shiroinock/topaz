# 0060. dunion typeIdent manual sort (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0059](./0059-short-name-positive-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:429`, where `typeIdent` built dunion names
with `[...t.variants].sort().join("_or_")`. The compiler subset does not
support array sorting, and spread in this expression is unnecessary.

## Decision

Build a sorted copy of dunion variant names with manual insertion sort, then
assemble the `_or_` suffix in a loop. This preserves canonical dunion
identifier ordering without JavaScript array helper dependencies.

Rejected alternatives: adding `Array.sort` would be a broader library/runtime
feature; depending on incoming variant order would make identifiers less
canonical.

## Implementation

- `src/codegen.ts:429` replaces the spread/sort/join chain with a
  subset-compatible insertion sort over variant names.
- The comparison reuses `typeKeyLess`, which is byte-wise over ASCII strings.

## Consequences

- **Accepted**: dunion type identifiers stay deterministic.
- **Rejected**: no `Array.sort` support is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
