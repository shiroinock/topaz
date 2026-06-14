# 0609 - Descriptor-local contextual literal tree call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.142

## Context

[0608](./0608-descriptor-local-contextual-object-leaf-walker.md) replaced the
explicit contextual object-depth ladder with a descriptor-local object walker,
but kept mixed object/array recursion pinned as the next fail frontier. The
remaining accepted shape was still the same nested call-argument contextual
object boundary: the owning nested call argument supplies the contextual
parameter type, and the final object is emitted only after child awaited call
leaves have been materialized.

## Decision

Generalize the descriptor-local walker from object-only to object+array literal
trees. The walker recurses through object `prop_kv` values and normal array
elements in source order, plans only awaited descriptor-backed `call_expr`
leaves, and replaces each exact leaf with the child nested-call result temp in
the transformed owning object argument. Rejected alternatives remain standalone
object/array materialization, ephemeral literal descriptors, a general
expression-decomposition IR, scheduler/runtime changes, and accepting array
spread, sparse arrays, object spread/shorthand/method/computed properties,
optional/spread/constructor/element calls, assignment/update/`new` leaves, or
short-circuit binary trees.

## Implementation

- `src/codegen.ts:6474` renames the descriptor-local walker to
  `tryWalkNestedMultiAwaitLiteralTreeCallLeaves` and lets it accept either an
  `ObjectLitExpr` or `ArrayLitExpr`.
- `src/codegen.ts:6486` gathers object property values or normal array element
  expressions with self-host-friendly loops, rejecting shorthand/spread object
  properties and array spread elements before decomposition.
- `src/codegen.ts:6502` walks children in source order, reuses
  `tryPlanNestedMultiAwaitObjectCallLeaf` for awaited call leaves, and recurses
  only into object/array literal children that themselves contain awaits.
- `src/codegen.ts:6718` routes the existing contextual nested-call object
  argument branch through the literal-tree walker, preserving final contextual
  object emission by the owning nested call argument.
- `tests/smoke.sh:3094` adds the mixed object/array/object positive regression,
  and `tests/smoke.sh:3119` pins array spread as the next deferred frontier.

## Consequences

- **Accepted**: descriptor-backed outer calls in declaration initializer,
  terminal return, and expression-statement discard positions where a nested
  descriptor-backed call argument contains a contextual object literal whose
  nested object/array literal tree ends in awaited descriptor-backed call
  leaves.
- **Preserved**: the root entry point is still the contextual object argument
  branch; no standalone literal temp, ephemeral descriptor, or general IR is
  introduced.
- **Rejected**: array spread remains deferred and reports
  `await expression lowering is deferred`.
- **Regression**:
  `async_call_arg_contextual_object_array_object_snapshot_leaf_descriptor_await`
  proves source-order mixed object/array/object materialization and deterministic
  result `1126`.
- **Regression**:
  `await_call_arg_nested_snapshot_array_spread_leaf_deferred_fail` keeps the
  next array-spread frontier deferred.
- **Regression count**: smoke covers 681 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
