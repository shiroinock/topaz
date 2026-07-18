# 0643 - Multi-await assignment RHS leaves

- **Status**: Accepted
- **Date**: 2026-07-19
- **Phase**: 5.176

## Context

[0642](./0642-awaited-assignment-target-refs.md) centralized safe local,
class-field, interface-field, and array-element target metadata in
`AwaitTargetRef`, but assignment leaves still required exactly one RHS await.
Non-short-circuit RHS trees with multiple otherwise supported awaits therefore
stopped at the general deferred-lowering diagnostic.

## Decision

Add a narrow assignment-expression planner over the existing async-frame event
shape. It recognizes one safe `AwaitTargetRef`, plans simple RHS awaits and
snapshot leaves in source order, captures receiver, index, and compound old
value before the first await, and attaches one assignment materialization to
the final await step. The materialized value replaces the assignment expression
so initializer, return, and statement contexts retain assignment-result
semantics.

Rejected alternatives: a general expression IR would exceed this leaf; storing
target metadata again before the final await would violate source order; runtime
or scheduler changes are unnecessary; accepting effectful targets or
short-circuit RHS would require separate control-flow decomposition.

## Implementation

- `src/codegen.ts:189` marks materialized temps whose receiver and old value
  already live in the async frame.
- `src/codegen.ts:243` gives plain class-field assignment a dedicated
  materialization shape, matching the existing interface and array setters.
- `src/codegen.ts:8445` plans the multi-await RHS, first-step target snapshots,
  final assignment temp, and expression-result replacement.
- `src/codegen.ts:9968` avoids recapturing an old value that was stored before
  the first await.
- `src/codegen.ts:10141` reads captured receivers and indices from the frame
  during the one final setter/write.

## Consequences

- **Accepted**: `=` and supported compound assignments for safe identifiers,
  concrete class fields, interface fields, and array elements can contain two
  or more simple awaits in supported non-short-circuit RHS trees.
- **Ordering**: RHS awaits remain left-to-right; target receiver/index/old value
  precede them; the write occurs once after the final await; its value is the
  assignment expression result.
- **Rejected**: effectful receivers or indices, target-side await, `&&`, `||`,
  `??`, conditional/optional/spread/arbitrary decomposition remain deferred.
- **Regressions**: promoted interface and array compound fixtures plus unsafe
  receiver, unsafe index, and short-circuit failures bring smoke coverage to
  719 explicit cases.
- **Scope**: this remains local lowering over the existing async frame; runtime,
  Promise scheduling, PromiseLike, thenables, and general IR are unchanged.
