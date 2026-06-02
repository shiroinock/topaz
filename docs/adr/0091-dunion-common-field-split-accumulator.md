# 0091. dunionCommonFieldType split accumulator (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0090](./0090-dunion-common-field-explicit-state.md) moved the full graph
self-host probe to `src/codegen.ts:1438`, where `dunionCommonFieldType`
assigned a concrete `TopazType` into a variable initialized to `undefined`. The
current flow state treated the variable as the undefined branch at that
assignment point.

## Decision

Track accumulator presence with `hasResult: boolean` and store the concrete
type in `result: TopazType`, initialized to `T_UNDEFINED` as a placeholder until
`hasResult` is true.

Rejected alternatives: changing assignment widening for narrowed union locals is
flow-analysis work; using non-null assertions would not address the assignment
site.

## Implementation

- `src/codegen.ts:1430` introduces `hasResult`.
- `src/codegen.ts:1431` changes `result` to a concrete `TopazType`.
- `src/codegen.ts:1439` sets both values on first field.
- `src/codegen.ts:1445` returns `result` only when `hasResult` is true.

## Consequences

- **Accepted**: common dunion field detection is unchanged.
- **Rejected**: no flow-analysis change is added.
- **Regression**: no new example was added because existing dunion common-field
  tests cover behavior, and the full graph self-host probe covers this
  compiler-source cleanup.
