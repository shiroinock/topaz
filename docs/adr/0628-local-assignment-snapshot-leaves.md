# 0628 - Local assignment snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.161

## Context

[0592](./0592-side-effectful-binary-await-snapshots.md) introduced neutral
side-effect snapshot leaves for value-returning call expressions in binary
trees. [0593](./0593-side-effectful-array-await-snapshots.md),
[0594](./0594-side-effectful-contextual-object-await-snapshots.md), and
[0595](./0595-contextual-object-nested-snapshot-inheritance.md) reused that
policy for arrays and contextual object materialization, while
[0625](./0625-statement-discard-direct-object-snapshot-materialization.md)
through [0627](./0627-statement-discard-nested-object-snapshot-materialization.md)
extended the same path to statement-discard object materialization. The next
small gap was a simple local assignment leaf with no nested await, which has
source-order side effects but needs no receiver or index snapshot.

## Decision

Simple identifier-target `=` assignment expressions with no nested await are
snapshot leaves. They continue through the existing `AwaitSnapshotTemp`
store/restore path, so the assignment value is evaluated once before the later
await that requires the snapshot and then reused from the transformed tree.

Rejected alternatives: a new assignment-specific descriptor would duplicate
the neutral snapshot machinery without adding state; receiver/index snapshots
would be unnecessary for identifier targets; property, interface field, array
element, compound, update, `new`, assignment-with-await, optional call, spread,
short-circuit, thenable, scheduler, runtime, and general IR work remain
deferred to dedicated descriptors or future phases.

## Implementation

- `src/codegen.ts:8868` keeps nested-await rejection at the front of
  `isSnapshotMultiAwaitLeaf(...)`, then accepts only `assign_expr` leaves whose
  operator is `=` and whose unwrapped target is an identifier.
- `src/codegen.ts:8835` lets call-argument binary collection reach that shared
  snapshot predicate before the assignment-await descriptor branch.
- `src/codegen.ts:9535` restores identifier assignment effects from the saved
  snapshot temp on resume, without re-running the RHS expression.
- `src/codegen.ts:8465` and `src/codegen.ts:8542` continue to infer, type-check,
  store, and replace snapshot leaves as `AwaitSnapshotTemp` values for array
  and object materialization; binary planners use the same event kind.
- `tests/smoke.sh:3100` and `tests/smoke.sh:3118` promote the former local
  assignment deferred fixtures across object, binary, array, return, and
  expression-statement surfaces.
- `tests/smoke.sh:3146` adds a property-assignment fail regression to preserve
  the non-local assignment boundary.

## Consequences

- **Accepted**:
  `examples/await_binary_mixed_side_effect_deferred_fail.ts`,
  `examples/await_array_literal_mixed_side_effect_deferred_fail.ts`,
  `examples/await_return_expr_deferred_fail.ts`,
  `examples/await_expression_statement_deferred_fail.ts`,
  `examples/await_object_literal_nested_object_side_effect_deferred_fail.ts`,
  `examples/await_object_literal_statement_nested_object_assignment_deferred_fail.ts`,
  `examples/await_call_arg_string_static_deferred_fail.ts`,
  `examples/await_call_arg_nested_flat_builtin_deferred_fail.ts`, and
  `examples/await_call_arg_path_variadic_deferred_fail.ts`
  now prove local assignment snapshot evaluation through existing planners.
- **Rejected**:
  `examples/await_binary_property_assignment_side_effect_deferred_fail.ts`
  keeps property assignment leaves on the deferred await-lowering path.
- **Scope**: assignment leaves whose RHS contains await, non-local assignment
  targets, compound/update forms, `new`, optional calls, spread, short-circuit
  decomposition, PromiseLike/thenable policy, scheduler/runtime changes, and
  general expression IR remain out of scope.
- **Regression count**: smoke covers 694 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
