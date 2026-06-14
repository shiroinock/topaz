# 0608 - Descriptor-local contextual object leaf walker

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.141

## Context

[0603](./0603-contextual-object-snapshot-call-leaves.md) through
[0607](./0607-contextual-object-deeper-object-snapshot-call-leaves.md) accepted
descriptor-backed nested call arguments whose contextual object literal
contained awaited descriptor-backed `call_expr` leaves at successively deeper
object-property paths. That proved the source-order event stream and contextual
object emission boundary, but left the implementation as an explicit object
depth ladder and kept the next deepest object shape pinned as a fail fixture.

## Decision

Replace the explicit object-depth ladder with a descriptor-local object walker
that recurses only through `prop_kv` object-literal property values and plans
only awaited descriptor-backed `call_expr` leaves. The owning nested call
argument still supplies the contextual parameter type and final object
materialization; each accepted call leaf becomes a child nested call whose
result temp replaces that exact leaf in the transformed object argument. The
direct array-property branch from [0604](./0604-contextual-object-array-snapshot-call-leaves.md)
stays separate and non-recursive. Rejected alternatives remain a general
expression-decomposition IR, standalone literal materialization, ephemeral
object/array descriptors, object/array mixed recursion, nested array recursion,
spread/shorthand/method/computed properties, optional/spread/constructor/
element calls, assignment/update/`new` leaves, short-circuit binary trees, and
scheduler or runtime changes.

## Implementation

- `src/codegen.ts:6442` adds `tryPlanNestedMultiAwaitObjectCallLeaf`, the shared
  child nested-call materialization path for contextual object call leaves.
- `src/codegen.ts:6474` adds `tryWalkNestedMultiAwaitObjectCallLeaves`, which
  walks `prop_kv` object properties in source order, recurses only into nested
  object literals, and returns `undefined` for any awaited non-call,
  non-object value.
- `src/codegen.ts:6698` preserves the existing direct array-property branch as
  a separate non-recursive case, so array elements inside recursively walked
  objects stay outside this phase.
- `src/codegen.ts:6736` and `src/codegen.ts:6757` route root contextual object
  call leaves and nested object-property leaves through the shared object-only
  walker while keeping the transformed object argument as the final contextual
  nested-call argument.
- `examples/async_call_arg_contextual_object_deepest_object_snapshot_leaf_descriptor_await.ts:29`
  converts the former deepest object frontier into a positive regression, and
  `examples/await_call_arg_nested_snapshot_object_array_leaf_deferred_fail.ts:23`
  pins mixed object/array recursion as the next rejected frontier.

## Consequences

- **Accepted**: descriptor-backed outer calls in declaration initializer,
  terminal return, and expression-statement discard positions where a nested
  descriptor-backed call argument contains a contextual object literal with an
  arbitrarily deep object-property path ending in an awaited descriptor-backed
  `call_expr` leaf.
- **Preserved**: the object literal remains contextual to the owning nested
  call argument; nested object values are not async-frame roots or standalone
  temps, and direct array properties remain the narrow non-recursive branch
  accepted by phase 5.137.
- **Rejected**: root statement-discard object materialization, standalone
  literal materialization, ephemeral object/array descriptors, object/array
  mixed recursion, nested array recursion, optional/spread/constructor/element
  calls, assignment/update/`new` leaves, short-circuit binary trees, and
  scheduler or runtime changes.
- **Regression**:
  `async_call_arg_contextual_object_deepest_object_snapshot_leaf_descriptor_await`
  proves source-order deepest object materialization and deterministic result
  `1126`.
- **Regression**:
  `await_call_arg_nested_snapshot_object_array_leaf_deferred_fail` keeps the
  next mixed object/array frontier deferred with `await expression lowering is
  deferred`.
- **Regression count**: smoke covers 680 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
