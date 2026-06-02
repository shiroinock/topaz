# 0096. AliasRecursionMarker info positive narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0095](./0095-alias-recursion-number-positive-narrowing.md) moved the full
graph self-host probe to `src/codegen.ts:1036`, where
`AliasRecursionMarker.markRecursive` assigned through a `Map.get` result after
an early internal-error guard. The current self-host flow still treated the
local as `TypeAliasInfo | undefined` at the property assignment.

## Decision

Perform the assignment inside the positive `info !== undefined` branch and keep
the internal-error path for impossible missing aliases.

Rejected alternative: broadening flow analysis for never-returning helpers is
compiler work and unnecessary for this helper.

## Implementation

- `src/codegen.ts:1035` rewrites `markRecursive` to assign in the positive
  branch.

## Consequences

- **Accepted**: recursive alias marking behavior is unchanged.
- **Rejected**: no flow-analysis change is added.
- **Regression**: no new example was added because existing recursive alias
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
