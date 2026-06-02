# 0095. AliasRecursionMarker number positive narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0094](./0094-mark-recursive-aliases-state-object.md) moved the full graph
self-host probe to `src/codegen.ts:1010`, where `AliasRecursionMarker.numberAt`
returned a `Map.get` result after an early internal-error guard. The current
self-host flow did not narrow the local enough after that guard.

## Decision

Return the number from inside a positive `value !== undefined` branch and leave
the internal-error path as the fallback.

Rejected alternative: broadening flow analysis for never-returning helpers is
compiler work and unnecessary for this internal helper.

## Implementation

- `src/codegen.ts:1009` rewrites `numberAt` to return inside the positive branch.

## Consequences

- **Accepted**: Tarjan number lookup behavior is unchanged.
- **Rejected**: no flow-analysis change is added.
- **Regression**: no new example was added because existing recursive alias
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
