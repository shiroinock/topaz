# 0592 - Side-effectful binary await snapshots

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.125

## Context

[0585](./0585-mixed-pure-multi-await-binary-trees.md) accepted mixed binary
trees with awaited leaves and conservative pure leaves. Pure leaves can remain
in the final transformed expression because evaluating them after the last
await has no observable effect in the current subset. Side-effectful leaves are
different: a call between two awaited operands must run after the first await
resumes and before the next awaited operand source expression is evaluated.
[0591](./0591-statement-discard-object-materialization-boundary.md) also keeps
object/array materialization boundaries explicit, so this step must not become
arbitrary expression decomposition.

## Decision

Introduce a neutral binary snapshot descriptor for side-effectful non-await
leaves that must run between suspension points. In this phase the snapshot
subset is deliberately narrow: value-returning `call_expr` leaves with no
nested await, no spread argument, and no optional call. Snapshot leaves before a
following awaited leaf are evaluated as pre-await stores on that following
suspension step, saved into the async frame, restored during final completion,
and replaced with their temp in the transformed binary expression.

Rejected alternatives: reusing `preAwaitArgTemps` would couple binary lowering
to call-argument terminology; accepting arbitrary assignments, updates, `new`,
ternaries, short-circuit operators, arrays, or objects would need broader
source-order decomposition; extending the call-argument binary planner in the
same patch would violate the current top-level binary scope.

## Implementation

- `src/codegen.ts:166` defines `AwaitSnapshotTemp`, and async initializer,
  return, statement, and step-plan records carry `preAwaitSnapshotTemps`.
- `src/codegen.ts:6674` builds top-level multi-await binary plans from ordered
  leaf events, attaches pending snapshot temps to the next awaited leaf, and
  leaves post-final-await calls in final completion order.
- `src/codegen.ts:6885` adds the event collector while leaving the older
  pure-only binary collector available for call-argument planning.
- `src/codegen.ts:6924` accepts only conservative call snapshot leaves and
  rejects nested awaits, spreads, and optional calls.
- `src/codegen.ts:7416` and `src/codegen.ts:7428` store and restore snapshot
  temps through the async frame alongside existing receiver/index/arg temps.

## Consequences

- **Accepted**: initializer, terminal return, and expression-statement binary
  trees like `await left() + mark("middle", 2) + await right()`.
- **Preserved**: pure-leaf final completion from 5.118, source-order await
  operand evaluation, existing call-argument restrictions, no object/array
  materialization change, no scheduler/runtime change, and no Promise ABI
  change.
- **Rejected**: side-effectful non-call leaves, void snapshot calls,
  assignment/update/new, ternary, logical/nullish short-circuit, spreads,
  optional calls, nested awaits inside awaited operands or snapshot calls, and
  array/object/call-argument snapshot expansion.
- **Regression**: `async_binary_side_effect_snapshot_multiple_await` proves
  result values and visible `left -> middle -> right` source order across
  initializer, return, and statement positions.
- **Regression**: `await_binary_mixed_side_effect_deferred_fail` now uses an
  assignment leaf so unsupported side-effectful binary decomposition still
  reports `await expression lowering is deferred`.
- **Regression count**: smoke covers 661 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
