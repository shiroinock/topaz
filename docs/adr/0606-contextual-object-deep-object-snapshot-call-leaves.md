# 0606 - Contextual object deep object snapshot call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.139

## Context

[0605](./0605-contextual-object-nested-object-snapshot-call-leaves.md) accepted a
descriptor-backed nested call argument whose contextual object literal had a
direct nested object property with an awaited `call_expr` leaf. The next pinned
frontier was one more object level: a contextual object argument contains a
direct nested object property, that object contains another direct nested object
property, and that deeper object's direct `prop_kv` value is an awaited
descriptor-backed call. The literal tree should still belong to the owning
nested call argument's contextual parameter type.

## Decision

Repeat the A-line descriptor-local pattern for exactly this two-level nested
object shape. When the deep nested property value is a descriptor-backed
`call_expr` containing awaits, plan that call recursively as a child nested call,
replace only that deep property value with the child result temp, and append the
child awaits/materialization to the shared `callArgEvents` stream in source
order. Rejected alternatives: a recursive nested literal walker, general
expression decomposition, ephemeral object/array materialization descriptors,
standalone object materialization, nested array recursion, object spread/
shorthand/method/computed properties, optional/spread/constructor/element calls,
assignment/update/`new` leaves, short-circuit binary trees, and scheduler or
runtime changes remain deferred.

## Implementation

- `src/codegen.ts:6605` keeps the 5.136 direct property-call path, the 5.137 array
  path, and the 5.138 nested-object path, but now recognizes one nested object
  value inside that direct nested object.
- `src/codegen.ts:6618` requires every object along the accepted deep path to use
  `prop_kv`; shorthand, spread, methods, and computed properties continue to
  reject through the descriptor-local planner.
- `src/codegen.ts:6630` plans only deep direct property `call_expr` leaves that
  contain awaits, replaces the leaf with the child result temp, and records the
  child first-await dependency on the owning nested call argument.
- `src/codegen.ts:6654` appends child materialization events to the same
  `callArgEvents` stream so the owning contextual `readBox` call, outer snapshot
  call, and later sibling await preserve source order.
- `examples/async_call_arg_contextual_object_deep_object_snapshot_leaf_descriptor_await.ts:29`
  converts the former deep-object frontier into a positive regression, and
  `examples/await_call_arg_nested_snapshot_deeper_object_leaf_deferred_fail.ts:23`
  pins the next three-level object frontier.

## Consequences

- **Accepted**: descriptor-backed outer calls in declaration initializer,
  terminal return, and expression-statement discard positions where a nested
  descriptor-backed call argument contains a contextual object literal with a
  two-level nested object property whose direct value is an awaited
  descriptor-backed call.
- **Preserved**: left outer await, deep object child await/materialization,
  contextual `readBox({ outer: { nested: { value: ... } } })`, outer snapshot,
  and later sibling await ordering all stay in the existing `callArgEvents` /
  post-await-materialized-temp model.
- **Rejected**: root statement-discard object materialization, standalone
  literal materialization, three-level nested object recursion, nested array
  recursion, optional/spread/constructor/element calls, assignment/update/`new`
  leaves, short-circuit binary trees, and scheduler or runtime changes.
- **Regression**:
  `async_call_arg_contextual_object_deep_object_snapshot_leaf_descriptor_await`
  proves source-order deep object materialization and deterministic result
  `1126`.
- **Regression**:
  `await_call_arg_nested_snapshot_deeper_object_leaf_deferred_fail` keeps deeper
  object property call leaves deferred with `await expression lowering is
  deferred`.
- **Regression count**: smoke covers 684 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
