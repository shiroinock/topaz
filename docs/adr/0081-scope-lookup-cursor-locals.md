# 0081. Scope lookup cursor locals (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0080](./0080-scope-lookup-explicit-loop-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:753`, where a narrowed `narrowFrame` loop
variable was reassigned from `currentNarrowFrame.parent`. The declared variable
is `ScopeFrame | undefined`, but the current flow state at that point treated it
as `ScopeFrame`.

## Decision

Guard separate cursor locals instead of the loop variables themselves. Each
iteration copies the union cursor (`frame` or `narrowFrame`) to a local, checks
that local against `undefined`, and uses the narrowed local for member access.
The loop variable remains the reassignment target for parent links.

Rejected alternatives: widening assignment behavior for narrowed variables is
compiler flow-analysis work; changing the linked-frame scope representation
would not address the underlying loop cursor pattern.

## Implementation

- `src/codegen.ts:741` adds `frameCursor` in `lookup`.
- `src/codegen.ts:750` adds `narrowFrameCursor` in `lookup`.
- `src/codegen.ts:772` adds `frameCursor` in `lookupBase`.
- `src/codegen.ts:800` and `src/codegen.ts:807` apply the same pattern in
  `lookupAcrossBarrier`.

## Consequences

- **Accepted**: scope lookup behavior is unchanged.
- **Rejected**: no flow-analysis change is added.
- **Regression**: no new example was added because existing scope, narrowing,
  closure, and arrow tests cover behavior, and the full graph self-host probe
  covers this compiler-source cleanup.
