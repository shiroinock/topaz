# 0633 - Array element compound assignment snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.166

## Context

[0630](./0630-array-element-assignment-snapshot-leaves.md) accepted safe array
element `=` assignment leaves, [0631](./0631-local-compound-assignment-snapshot-leaves.md)
accepted local compound assignment leaves, and
[0632](./0632-class-field-compound-assignment-snapshot-leaves.md) accepted safe
concrete class field compound assignment leaves. The remaining non-interface
compound target in the same snapshot family is `values[i] += expr` between two
awaited operands.

Array element compound assignment already snapshots the receiver, index, old
element value, and computed next value inside the existing helper. The missing
piece was expression value semantics: after the array set, the assignment
expression must evaluate to the assigned value.

## Decision

`emitArrayElementCompoundAssignment` now yields the computed `nextTmp` after
performing `topaz_array_*_set`, so the helper has normal assignment-expression
value semantics without changing the array-set ABI. Compound assignment
snapshot leaves accept element-access targets only through the existing safe
array element snapshot target predicate, preserving the current receiver and
index safety boundary.

Rejected alternatives: changing `topaz_array_*_set` to return the assigned
value would broaden the runtime/prelude ABI change; materializing unsafe
receiver or index target references would require a later target-reference
design; accepting interface setter-backed compound assignment would change a
separate void setter value policy; update expressions remain separate because
prefix and postfix values need their own lowering decision.

## Implementation

- `src/codegen.ts:8872` keeps compound snapshot leaves behind the lowerable
  compound operator gate.
- `src/codegen.ts:8875` accepts compound element-access targets only when
  `isArrayElementSnapshotAssignmentTarget` accepts the receiver, index, array
  receiver type, and numeric index type.
- `src/codegen.ts:15138` makes direct array element compound assignment emit
  `nextTmp` after `topaz_array_*_set`.
- `tests/smoke.sh:3150` promotes the historical array element compound fixture
  to a positive source-order regression.
- `tests/smoke.sh:3151` adds the side-effectful index deferred regression.

## Consequences

- **Accepted**:
  `examples/await_binary_array_element_assignment_compound_deferred_fail.ts`
  now proves `await Promise.resolve(10) + (values[0] += 2) + await
  Promise.resolve(30)` mutates the element before the second await and returns
  `43`.
- **Rejected**:
  `examples/await_binary_array_element_assignment_compound_side_effect_index_deferred_fail.ts`
  keeps side-effectful index decomposition deferred, and
  `examples/await_binary_interface_field_compound_assignment_side_effect_deferred_fail.ts`
  keeps setter-backed compound assignment deferred.
- **Regression count**: smoke covers 708 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: runtime helpers, scheduler work, thenable support, unsafe
  receiver/index decomposition, interface setter value semantics, update
  expressions, nested await in the compound expression, and general expression
  IR remain out of scope.
