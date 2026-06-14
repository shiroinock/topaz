# 0604 - Contextual object array snapshot call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.137

## Context

[0603](./0603-contextual-object-snapshot-call-leaves.md) accepted a
descriptor-backed nested call argument whose contextual object literal had a
direct `prop_kv` awaited `call_expr` property value. The next pinned frontier
was the same descriptor-local shape with one additional literal boundary: the
property value is an array literal, and a direct normal array element is the
awaited `call_expr` leaf. The array must stay owned by the contextual object
argument instead of becoming a root async-frame materialization surface.

## Decision

Extend only the nested-call contextual object branch to inspect direct array
literal property values. When a normal direct array element is a
descriptor-backed `call_expr` containing awaits, plan it recursively as a child
nested call, replace that element with the child result temp, and append the
child awaits/materialization to the existing `callArgEvents` stream in source
order. Rejected alternatives: a general expression-decomposition IR and an
ephemeral object/array materialization descriptor remain too broad; array
spreads, nested array recursion, nested object property recursion, object
spread/shorthand/method/computed properties, optional/spread/constructor/element
calls, assignment/update/`new` leaves, and scheduler/runtime changes stay
deferred.

## Implementation

- `src/codegen.ts:6605` keeps the 5.136 direct property-call path, but also
  recognizes array literal property values inside contextual object arguments.
- `src/codegen.ts:6609` requires normal direct array elements and rejects spread
  elements for this descriptor-local phase.
- `src/codegen.ts:6613` recursively plans only direct element `call_expr` leaves
  that contain awaits, replaces each element with the child result temp, and
  records the child first-await dependency on the owning nested call argument.
- `src/codegen.ts:6642` appends child materialization events to the shared
  `callArgEvents` stream so the owning object argument and later sibling awaits
  preserve source order.
- `examples/async_call_arg_contextual_object_array_snapshot_leaf_descriptor_await.ts`
  converts the former array frontier into a positive regression, and
  `examples/await_call_arg_nested_snapshot_nested_object_leaf_deferred_fail.ts`
  pins the next nested-object frontier.

## Consequences

- **Accepted**: descriptor-backed outer calls in declaration initializer,
  terminal return, and expression-statement discard positions where a nested
  descriptor-backed call argument contains a contextual object literal with a
  direct array property value containing a direct awaited `call_expr` element.
- **Preserved**: left outer await, array element child await/materialization,
  contextual `readBox({ values: [...] })`, outer snapshot, and later sibling
  await ordering all stay in the existing `callArgEvents` /
  post-await-materialized-temp model.
- **Rejected**: root statement-discard object materialization, general literal
  materialization, array spread, nested object property leaves, nested array
  recursion, optional/spread/constructor/element calls, assignment/update/`new`
  leaves, short-circuit binary trees, and scheduler or runtime changes.
- **Regression**:
  `async_call_arg_contextual_object_array_snapshot_leaf_descriptor_await`
  proves source-order array element materialization and deterministic result
  `1126`.
- **Regression**:
  `await_call_arg_nested_snapshot_nested_object_leaf_deferred_fail` keeps nested
  object property call leaves deferred with `await expression lowering is
  deferred`.
- **Regression count**: smoke covers 676 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
