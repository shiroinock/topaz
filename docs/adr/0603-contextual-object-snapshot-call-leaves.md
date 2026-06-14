# 0603 - Contextual object snapshot call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.136

## Context

[0602](./0602-nested-snapshot-call-leaves.md) pinned object-literal
snapshot-leaf decomposition as the next deferred frontier after recursive
nested call leaves. The remaining self-hosting-adjacent shape is still
call-argument-owned: a descriptor-backed nested call receives a contextual
object literal, and one direct `prop_kv` value is itself a descriptor-backed
`call_expr` leaf containing an await. The object literal must keep its
contextual parameter type from the owning nested call, while the property call
leaf still needs source-order decomposition before later outer sibling awaits.

## Decision

Accept only contextual object literal direct `prop_kv` awaited call leaves
inside nested call arguments, using the existing recursive nested-call
descriptor tree and shared `callArgEvents` stream. The property value call is
planned recursively, materialized to its nested result temp, and that temp
replaces only the direct property value in the owning object literal; the
object allocation remains in the final contextual object emission of the
owning nested call. Rejected alternatives: a general expression-decomposition
IR and an ephemeral object materialization descriptor remain too broad for
this phase, root statement-discard object materialization stays rejected by
[0591](./0591-statement-discard-object-materialization-boundary.md), and
array/nested-object/spread/shorthand/method/computed properties remain
deferred.

## Implementation

- `src/codegen.ts:286` adds a transformed-object argument map to nested call
  plans without changing the public async step/event unions.
- `src/codegen.ts:6594` recognizes nested call arguments whose unwrapped
  expression is an `object_lit`, requires direct `prop_kv` properties, and
  recursively plans only direct property `call_expr` values that contain awaits.
- `src/codegen.ts:6621` replaces the accepted property call leaf with the child
  nested result temp and records the child first-await dependency on the owning
  object argument index.
- `src/codegen.ts:7047` includes transformed object arguments in nested-call
  signature resolution so contextual parameter typing is preserved.
- `src/codegen.ts:7258` and `src/codegen.ts:7287` carry transformed object
  arguments through pre-argument temps and final nested call emission.

## Consequences

- **Accepted**: descriptor-backed outer calls in declaration initializer,
  terminal return, and expression-statement discard positions where a nested
  descriptor-backed call argument contains a contextual object literal with a
  direct awaited `call_expr` property value.
- **Preserved**: property child awaits, property materialization,
  `readBox({ value: ... })`, outer snapshot materialization, and later outer
  sibling awaits all stay in the existing source-order `callArgEvents` stream.
- **Rejected**: object literal as a root statement-discard materialization
  surface, array literal and nested object literal property decomposition,
  object spread, shorthand, methods, computed properties, optional/spread,
  constructor/element calls, assignment/update/`new` leaves, short-circuit
  binary trees, and scheduler/runtime changes.
- **Regression**:
  `async_call_arg_contextual_object_snapshot_leaf_descriptor_await` proves left
  await before property nested await, property call materialization before
  contextual `readBox`, outer snapshot before binary consumption, later sibling
  await ordering, and deterministic result `1126`.
- **Regression**:
  `await_call_arg_nested_snapshot_array_leaf_deferred_fail` pins array literal
  property leaves as the next deferred frontier.
- **Regression count**: smoke covers 675 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
