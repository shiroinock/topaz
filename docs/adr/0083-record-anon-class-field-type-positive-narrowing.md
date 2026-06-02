# 0083. recordAnonClass field type positive narrowing (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0082](./0082-record-anon-class-manual-key-sort.md) moved the full graph
self-host probe to `src/codegen.ts:1235`, where `recordAnonClass` used a
`fields.get(f)` result after an early internal-error guard. The current
self-host flow did not narrow the local to `TopazType` at the later use site.

## Decision

Use positive `!== undefined` branches for `fields.get(f)` results and introduce
a `TopazType` local inside each branch. Keep the internal-error path as the
unreachable fallback.

Rejected alternatives: broadening flow analysis for `never`-returning helpers is
compiler work; using non-null assertions would hit the same subset cleanup
queue.

## Implementation

- `src/codegen.ts:1232` rewrites canonical-key field type lookup to a positive
  branch.
- `src/codegen.ts:1247` applies the same pattern while building params and the
  ordered field map.

## Consequences

- **Accepted**: anonymous class canonical keys, params, and ordered fields are
  unchanged.
- **Rejected**: no flow-analysis change is added.
- **Regression**: no new example was added because existing type-literal and
  object-literal tests cover behavior, and the full graph self-host probe covers
  this compiler-source cleanup.
