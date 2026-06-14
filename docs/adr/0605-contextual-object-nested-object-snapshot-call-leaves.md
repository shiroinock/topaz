# 0605 - Contextual object nested object snapshot call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.138

## Context

[0604](./0604-contextual-object-array-snapshot-call-leaves.md) accepted a
descriptor-backed nested call argument whose contextual object literal had a
direct array property value with an awaited `call_expr` element. The next pinned
frontier was the object-shaped sibling: a contextual object argument contains a
direct nested object property value, and that nested object has one direct
`prop_kv` awaited `call_expr` leaf. This still belongs to the nested call
argument descriptor and should not create a standalone object materialization
surface.

## Decision

Extend only the nested-call contextual object branch to inspect one direct
nested object property value. When the nested object has a direct `prop_kv`
whose value is a descriptor-backed `call_expr` containing awaits, plan that call
recursively as a child nested call, replace only that nested property value with
the child result temp, and append the child awaits/materialization to the shared
`callArgEvents` stream in source order. Rejected alternatives: general
expression decomposition, ephemeral object/array materialization descriptors,
two-level object recursion, nested array recursion, object spread/shorthand/
methods/computed properties, optional/spread/constructor/element calls,
assignment/update/`new` leaves, short-circuit binary trees, and scheduler or
runtime changes remain deferred.

## Implementation

- `src/codegen.ts:6606` keeps the 5.136 direct property-call path and the 5.137
  array path, but now recognizes one direct nested object literal property value
  inside the contextual object argument.
- `src/codegen.ts:6607` requires every property in that direct nested object to
  be `prop_kv`; shorthand, spread, methods, and computed properties continue to
  reject through the descriptor-local planner.
- `src/codegen.ts:6619` recursively plans only direct nested-object property
  `call_expr` leaves that contain awaits, replaces each leaf with the child
  result temp, and records the child first-await dependency on the owning nested
  call argument.
- `src/codegen.ts:6640` appends child materialization events to the same
  `callArgEvents` stream so the owning contextual `readBox` call, outer snapshot
  call, and later sibling await preserve source order.
- `examples/async_call_arg_contextual_object_nested_object_snapshot_leaf_descriptor_await.ts:29`
  converts the former nested-object frontier into a positive regression, and
  `examples/await_call_arg_nested_snapshot_deep_object_leaf_deferred_fail.ts:23`
  pins the deeper two-level object frontier.

## Consequences

- **Accepted**: descriptor-backed outer calls in declaration initializer,
  terminal return, and expression-statement discard positions where a nested
  descriptor-backed call argument contains a contextual object literal with one
  direct nested object property whose direct property value is an awaited
  descriptor-backed call.
- **Preserved**: left outer await, nested object child await/materialization,
  contextual `readBox({ nested: { value: ... } })`, outer snapshot, and later
  sibling await ordering all stay in the existing `callArgEvents` /
  post-await-materialized-temp model.
- **Rejected**: root statement-discard object materialization, standalone
  literal materialization, two-level nested object recursion, nested array
  recursion, optional/spread/constructor/element calls, assignment/update/`new`
  leaves, short-circuit binary trees, and scheduler or runtime changes.
- **Regression**:
  `async_call_arg_contextual_object_nested_object_snapshot_leaf_descriptor_await`
  proves source-order nested object materialization and deterministic result
  `1126`.
- **Regression**:
  `await_call_arg_nested_snapshot_deep_object_leaf_deferred_fail` keeps deeper
  object property call leaves deferred with `await expression lowering is
  deferred`.
- **Regression count**: smoke covers 683 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
