# 0627 - Statement-discard nested-object snapshot materialization

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.160

## Context

[0624](./0624-statement-discard-nested-object-materialization.md) accepted
statement-discard nested object awaits with snapshot leaves disabled.
[0625](./0625-statement-discard-direct-object-snapshot-materialization.md)
then accepted direct root statement-discard object call snapshots, and
[0626](./0626-statement-discard-nested-array-snapshot-materialization.md)
accepted statement-discard nested array snapshots. The remaining narrow
object-literal gap was a root statement-discard `prop_kv` whose value is a
nested object literal containing conservative value-returning call snapshot
leaves between direct/simple awaited leaves.

## Decision

Nested object-valued root `prop_kv` properties in statement-discard object
literals inherit the statement-discard snapshot policy. The existing
`AwaitSnapshotTemp` descriptor remains the only evaluation-order mechanism:
nested object awaited leaves, pure leaves, and snapshot call leaves append to
the root object plan in source order, with no nested object pre-materialization
step.

Rejected alternatives: adding a second materialization boundary for nested
objects would allocate earlier than the descriptor needs; standalone object
literal inference would broaden language outside the statement-discard
descriptor; assignment/update/`new` leaves, optional calls, spread,
computed properties, methods/getters/setters, short-circuit expression
decomposition, nested awaits inside awaited operands or snapshot calls,
thenables, scheduler/runtime work, and general IR changes remain deferred.

## Implementation

- `src/codegen.ts:8628` delegates statement-discard object-valued root
  properties to `collectMultiAwaitObjectLiteralLeaves(...)` with snapshots
  enabled, so nested object `snapshot` events join the root object event stream.
- `src/codegen.ts:8542` continues to lower object snapshot events into
  `AwaitSnapshotTemp` stores before the following awaited leaf and replaces the
  exact original expression in the transformed object tree.
- `src/codegen.ts:8593` still synthesizes the required-field anonymous class
  target from the transformed statement-discard root before final
  `emitWithExpected(...)` materializes and discards it.

## Consequences

- **Accepted**:
  `examples/await_object_literal_statement_nested_object_side_effect_snapshot.ts`
  proves `left`, caller-side `sync tail`, pre-second-await snapshot `middle`,
  second await `right`, final-materialization nested snapshot `tail`, `done`,
  and `.then` ordering.
- **Preserved**:
  `examples/await_object_literal_statement_nested_object_assignment_deferred_fail.ts`
  keeps nested object assignment leaves rejected with deferred await lowering.
- **Rejected**: assignment/update/`new` leaves, optional calls, spread forms,
  computed properties, method/getter/setter syntax, short-circuiting trees,
  nested awaits inside accepted leaves, thenables, scheduler/runtime work, and
  standalone object literal inference outside the statement-discard descriptor.
- **Regression count**: smoke covers 693 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
