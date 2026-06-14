# 0593 - Side-effectful array await snapshots

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.126

## Context

[0586](./0586-mixed-pure-multi-await-array-literals.md) accepted array
literals that mix direct/simple awaited leaves with conservative pure leaves.
Pure leaves can remain uncaptured because final array materialization may
evaluate them after the last await without visible effects. [0592](./0592-side-effectful-binary-await-snapshots.md)
introduced a neutral source-order snapshot descriptor for side-effectful call
leaves in binary trees. Array literals need the same source-order preservation
for call elements that appear between awaited elements, including nested array
literals, without broadening object materialization or call-argument
decomposition.

## Decision

Use the neutral `AwaitSnapshotTemp` descriptor for array literal leaves. The
array collector now emits ordered leaf events: awaited leaves, pure leaves, and
snapshot leaves. Snapshot leaves before a later awaited leaf are evaluated as
pre-await stores on that following suspension step, restored during final
completion, and replaced with a temp in the transformed array expression. Pure
leaves remain uncaptured, and snapshot leaves after the final awaited leaf stay
in final materialization order.

Rejected alternatives: materializing nested arrays before awaits would create a
new array boundary and duplicate object-array policy work; accepting
assignments, updates, `new`, spreads, optional calls, ternaries, or logical
operators would require broader expression decomposition; teaching object
literals to inherit side-effectful array snapshots in this phase would bypass
the explicit object materialization boundary from [0591](./0591-statement-discard-object-materialization-boundary.md).

## Implementation

- `src/codegen.ts:6745` builds multi-await array plans from ordered leaf events,
  snapshots call leaves before following awaits, and attaches the pending
  snapshot temps to `preAwaitSnapshotTemps`.
- `src/codegen.ts:6853` collects array and nested-array leaves as events while
  preserving spread rejection and direct/simple awaited operand checks.
- `src/codegen.ts:6919` keeps contextual object nested-array collection on the
  pure-only path, so object literal materialization does not gain side-effectful
  array snapshots here.
- `src/codegen.ts:6973` shares the narrow call snapshot policy with binary
  lowering: value-returning `call_expr`, no nested await, no spread argument,
  and no optional call.
- `src/codegen.ts:7325` lets exact-expression replacement descend into array
  literals so nested array snapshot calls can be temp-replaced.

## Consequences

- **Accepted**: initializer, terminal return, and expression-statement array
  literals such as `[await left(), mark("middle", 2), await right()]`, plus
  nested array literals under the same root array plan.
- **Preserved**: pure-leaf final completion from 5.119, source-order await
  operand evaluation, existing async frame store/restore behavior, no object
  materialization change, no call-argument expansion, no scheduler/runtime
  change, and no Promise ABI change.
- **Rejected**: side-effectful non-call leaves, void snapshot calls,
  assignment/update/new leaves, spread elements, object literal recursion,
  ternary, logical/nullish short-circuit, optional calls, spread arguments,
  nested awaits inside awaited operands or snapshot calls, and statement-discard
  object materialization from [0591](./0591-statement-discard-object-materialization-boundary.md).
- **Regression**: `async_array_side_effect_snapshot_multiple_await` proves value
  materialization and visible `first -> middle -> second` order across
  initializer, return, statement discard, and nested array literal positions.
- **Regression**: `await_array_literal_mixed_side_effect_deferred_fail` now uses
  an assignment leaf so unsupported side-effectful array decomposition still
  reports `await expression lowering is deferred`.
- **Regression**: `await_return_expr_deferred_fail` also uses an assignment leaf
  because its former nested-array call leaf is now accepted by this phase.
- **Regression count**: smoke covers 662 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
