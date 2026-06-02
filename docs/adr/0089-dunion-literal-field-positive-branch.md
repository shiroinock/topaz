# 0089. dunionLiteralFor field positive branch (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0088](./0088-dunion-literal-union-positive-branch.md) moved the full graph
self-host probe to `src/codegen.ts:1408`, where `dunionLiteralFor` accessed a
string-literal field's `value` after a compound existence/kind check. The
current self-host flow did not carry that compound narrowing to the access.

## Decision

Split the check into nested positive branches and return from inside the
`kind === "string_literal"` branch.

Rejected alternatives: adding compound-condition narrowing here is compiler
flow-analysis work; non-null assertions would reintroduce the cleanup pattern.

## Implementation

- `src/codegen.ts:1407` checks `fieldMaybe !== undefined`.
- `src/codegen.ts:1408` checks `fieldMaybe.kind === "string_literal"` inside
  that branch.
- `src/codegen.ts:1409` returns `fieldMaybe.value` from the narrowed branch.

## Consequences

- **Accepted**: valid dunion literal lookup behavior is unchanged.
- **Rejected**: no flow-analysis change is added.
- **Regression**: no new example was added because existing discriminated-union
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
