# 0607 - Contextual object deeper object snapshot call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.140

## Context

[0606](./0606-contextual-object-deep-object-snapshot-call-leaves.md) accepted a
descriptor-backed nested call argument whose contextual object literal contained
a two-level nested object path ending in an awaited descriptor-backed
`call_expr` leaf. The next pinned frontier is the same A-line shape with exactly
one more object level: a direct property object contains another property
object, that object contains another property object, and that third object's
direct `prop_kv` value is the awaited descriptor-backed call leaf.

## Decision

Repeat the descriptor-local pattern for exactly this three-level nested object
shape. The owning contextual object literal remains typed and emitted by the
nested call argument's contextual parameter type, while only the deeper
descriptor-backed `call_expr` leaf is planned recursively as a child nested
call and replaced with the child result temp. Rejected alternatives remain a
recursive nested literal walker, general expression-decomposition IR,
ephemeral object/array materialization descriptors, standalone object
materialization, nested array recursion, object spread/shorthand/methods/
computed properties, optional/spread/constructor/element calls, assignment/
update/`new` leaves, short-circuit binary trees, and scheduler or runtime
changes.

## Implementation

- `src/codegen.ts:6627` keeps the descriptor-local object branch explicit and
  adds one more nested `prop_kv` loop beneath the 5.139 deep-object branch.
- `src/codegen.ts:6630` requires each object on the accepted path to keep using
  `prop_kv`, so shorthand, spread, methods, and computed properties stay
  outside this phase.
- `src/codegen.ts:6638` requires the deeper property value to be a
  descriptor-backed `call_expr` containing awaits; `src/codegen.ts:6654`
  replaces that leaf with the child result temp and records the dependency on
  the owning nested call argument.
- `src/codegen.ts:6665` sends the child materialization through the existing
  `callArgEvents` stream so the left outer await, nested child
  await/materialization, contextual `readBox`, outer snapshot, and later sibling
  await keep source order.
- `examples/async_call_arg_contextual_object_deeper_object_snapshot_leaf_descriptor_await.ts:29`
  converts the former three-level frontier into a positive regression, and
  `examples/await_call_arg_nested_snapshot_deepest_object_leaf_deferred_fail.ts:23`
  pins the four-level object frontier.

## Consequences

- **Accepted**: descriptor-backed outer calls in declaration initializer,
  terminal return, and expression-statement discard positions where a nested
  descriptor-backed call argument contains a contextual object literal with a
  three-level nested object property path whose direct value is an awaited
  descriptor-backed call.
- **Preserved**: the deeper object remains part of the transformed argument for
  the owning nested call; it is not materialized as an async-frame root or
  standalone temp.
- **Rejected**: root statement-discard object materialization, standalone
  literal materialization, four-level nested object recursion, nested array
  recursion, optional/spread/constructor/element calls, assignment/update/`new`
  leaves, short-circuit binary trees, and scheduler or runtime changes.
- **Regression**:
  `async_call_arg_contextual_object_deeper_object_snapshot_leaf_descriptor_await`
  proves source-order deeper object materialization and deterministic result
  `1126`.
- **Regression**:
  `await_call_arg_nested_snapshot_deepest_object_leaf_deferred_fail` keeps the
  next object property depth deferred with `await expression lowering is
  deferred`.
- **Regression count**: smoke covers 679 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
