# 0595 - Contextual object nested snapshot inheritance

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.128

## Context

[0589](./0589-contextual-object-nested-array-awaits.md) and
[0590](./0590-contextual-object-nested-object-awaits.md) established that a
contextual root object literal owns final materialization for nested array and
object property values. [0594](./0594-side-effectful-contextual-object-await-snapshots.md)
then added source-order snapshot temps for direct root `prop_kv` call leaves,
but intentionally left nested inheritance undecided so that statement-discard
objects would not gain an accidental materialization policy.

## Decision

Let nested array and nested object property values inherit the root contextual
object's snapshot policy only when the root planner is already in contextual
pure-leaf mode. Direct conservative value-returning call leaves inside those
nested values now become ordered `snapshot` events before a following awaited
leaf, are stored in existing `AwaitSnapshotTemp` frame slots, and are replaced
in the transformed root object before final contextual emission.

Rejected alternatives: adding an ephemeral materialization descriptor for
expression-statement object literals would bypass
[0591](./0591-statement-discard-object-materialization-boundary.md); materializing
nested arrays/objects before awaits would split ownership from the contextual
root emission path; admitting assignment, update, `new`, optional calls, spread
arguments, ternary/logical/nullish decomposition, or call-argument snapshots
would broaden the expression planner beyond this phase.

## Implementation

- `src/codegen.ts:6955` passes the inherited snapshot flag into nested array
  collection instead of forcing snapshots off under contextual objects.
- `src/codegen.ts:6957` forwards all nested array events while inheritance is
  enabled, preserving source order for pure, snapshot, and awaited leaves.
- `src/codegen.ts:6963` recurses into nested object values with the inherited
  snapshot flag so nested direct call leaves use the same predicate as root
  properties.
- `src/codegen.ts:6965` keeps statement-discard behavior unchanged because the
  root collector still starts with snapshots disabled when pure leaves are not
  allowed.
- `src/codegen.ts:7370` already descends into arrays and objects for exact
  expression replacement, so final contextual emission sees snapshot temps
  without pre-materializing nested values.

## Consequences

- **Accepted**: contextual declaration initializers and terminal returns whose
  root object contains nested array/object direct awaited leaves mixed with
  conservative direct call snapshot leaves.
- **Preserved**: source-order await operand evaluation, leaf-only snapshots,
  final root contextual materialization, post-final-await call evaluation during
  final emission, and the [0591](./0591-statement-discard-object-materialization-boundary.md)
  statement-discard object boundary.
- **Rejected**: expression-statement nested object/array side effects,
  side-effectful non-call leaves, assignment/update/`new` leaves, spreads,
  method shorthand, getters/setters, computed properties, optional calls,
  spread arguments, nested awaits inside awaited operands or snapshot calls,
  call-argument snapshot expansion, and scheduler/runtime changes.
- **Regression**: `async_object_nested_side_effect_snapshot_multiple_await`
  proves nested array and nested object snapshots for declaration initializers
  and terminal returns, including exactly-once calls before following awaits.
- **Regression**: `await_object_literal_nested_array_side_effect_deferred_fail`
  and `await_object_literal_nested_object_side_effect_deferred_fail` keep
  nested assignment leaves deferred with `await expression lowering is deferred`.
- **Regression count**: smoke covers 666 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
