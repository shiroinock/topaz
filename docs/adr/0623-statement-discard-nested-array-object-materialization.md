# 0623 - Statement-discard nested-array object materialization

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.156

## Context

[0589](./0589-contextual-object-nested-array-awaits.md) accepted nested array
values inside contextual object literals, while [0621](./0621-statement-discard-mixed-pure-object-materialization.md)
and [0622](./0622-statement-discard-shorthand-object-materialization.md)
established the explicit ephemeral materialization path for statement-discard
object literals. The remaining narrow gap was a root statement-discard object
literal whose root `prop_kv` value is an array literal containing direct/simple
awaited elements, pure elements, and nested arrays.

## Decision

Accept array-valued root `prop_kv` properties only inside the existing
statement-discard object materialization collector. The array literal does not
become its own await step; it delegates element traversal to the existing
recursive array collector with snapshots disabled, leaves pure elements in the
transformed array, replaces awaited elements with temps, and lets final
`emitWithExpected(...)` materialize the transformed object against the
synthesized required-field anonymous class target.

Rejected alternatives: accepting nested object-valued root properties would
reopen the separate recursive object-target question; pre-materializing nested
arrays before awaits would add a second allocation boundary; treating array
allocation as a generic pure leaf would bypass spread rejection and awaited
element traversal; accepting side-effectful elements, spreads, computed
properties, method/getter/setter syntax, ternary/logical/nullish trees,
thenables, scheduler changes, or general IR would exceed this syntax slice.

## Implementation

- `src/codegen.ts:8599` keeps the statement-discard object collector as the
  only entry point for this surface.
- `src/codegen.ts:8616` delegates root array-valued `prop_kv` values to
  `collectMultiAwaitArrayLiteralLeaves(...)` with snapshots disabled, then
  appends the awaited and pure array events to the root plan.
- `src/codegen.ts:8626` keeps nested object-valued root properties deferred.
- `src/codegen.ts:8633` continues to infer the transformed array literal field
  type during anonymous-class materialization target synthesis.
- `tests/smoke.sh:3103` promotes the former nested-array statement-discard
  fail fixture to a positive case.

## Consequences

- **Accepted**: `examples/await_object_literal_statement_nested_array_deferred_fail.ts`
  now proves source-order awaited nested-array elements, a sync tail before
  resumption, pure nested-array elements, a pure root property, post-statement
  continuation, and `.then`.
- **Preserved**: `await_object_literal_statement_nested_object_deferred_fail`
  and the side-effectful nested-array fail fixtures remain rejected.
- **Rejected**: standalone object literal inference outside the descriptor,
  fewer than two awaited leaves, object-valued root properties, spreads,
  side-effectful non-await values, thenable assimilation, and runtime
  scheduling changes.
- **Regression count**: smoke covers 691 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
