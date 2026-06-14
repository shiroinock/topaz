# 0594 - Side-effectful contextual object await snapshots

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.127

## Context

[0587](./0587-contextual-mixed-pure-multi-await-object-literals.md) accepted
contextual object literals that mix direct/simple awaited property values with
conservative pure leaves. Pure leaves can stay uncaptured because final
contextual object emission may evaluate them after the last await without
visible effects. [0592](./0592-side-effectful-binary-await-snapshots.md) and
[0593](./0593-side-effectful-array-await-snapshots.md) introduced and reused a
neutral source-order snapshot descriptor for side-effectful call leaves. The
same source-order issue now applies to direct object property calls between
awaited contextual properties.

## Decision

Reuse `AwaitSnapshotTemp` for direct `prop_kv` values of the root contextual
object literal. The object collector now emits ordered leaf events: awaited
leaves, pure leaves, and snapshot leaves. Snapshot property calls before a
later awaited property are evaluated as pre-await stores on that following
suspension step, restored during final completion, and replaced with a temp in
the transformed object literal. Pure leaves remain uncaptured, and snapshot
calls after the final awaited property stay in final contextual emission order.

Rejected alternatives: enabling expression-statement object snapshots would
bypass [0591](./0591-statement-discard-object-materialization-boundary.md);
letting nested object/array values inherit snapshots would create a second
materialization policy decision; accepting assignments, updates, `new`, spreads,
methods, computed properties, optional calls, or spread arguments would require
broader expression decomposition.

## Implementation

- `src/codegen.ts:6816` builds contextual object multi-await plans from ordered
  leaf events, snapshots direct call property values before following awaits,
  and attaches pending snapshot temps to `preAwaitSnapshotTemps`.
- `src/codegen.ts:6925` collects root object leaves as events while keeping
  snapshot collection gated by contextual `allowPureLeaves`.
- `src/codegen.ts:6953` forwards only awaited leaves from nested array/object
  property values and calls their collectors with snapshots disabled.
- `src/codegen.ts:6969` admits snapshot leaves only for direct root `prop_kv`
  values that pass the shared conservative call policy.
- `src/codegen.ts:7410` lets exact-expression replacement descend into object
  literals so direct property calls can be replaced with snapshot temps.

## Consequences

- **Accepted**: contextual declaration initializers and terminal returns such as
  `{ left: await left(), middle: mark("middle", 2), right: await right() }`.
- **Preserved**: pure-leaf final completion from 5.120, source-order await
  operand evaluation, existing async frame store/restore behavior, no
  expression-statement object materialization change, no nested object/array
  snapshot expansion, no call-argument expansion, and no scheduler/runtime
  change.
- **Rejected**: side-effectful non-call leaves, void snapshot calls,
  assignment/update/new leaves, nested object/array side-effectful calls, object
  spread, method shorthand, getters/setters, computed properties, ternary,
  logical/nullish short-circuit, optional calls, spread arguments, nested awaits
  inside awaited operands or snapshot calls, and statement-discard mixed object
  materialization from [0591](./0591-statement-discard-object-materialization-boundary.md).
- **Regression**: `async_object_side_effect_snapshot_multiple_await` proves
  contextual value materialization and visible source order for declaration
  initializer and terminal return, including post-final-await calls.
- **Regression**: `await_object_literal_mixed_side_effect_deferred_fail` now
  uses an assignment leaf so unsupported direct object decomposition still
  reports `await expression lowering is deferred`.
- **Regression**: `await_object_literal_nested_array_side_effect_deferred_fail`
  and `await_object_literal_nested_object_side_effect_deferred_fail` keep nested
  side-effectful call snapshots deferred.
- **Regression count**: smoke covers 668 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
