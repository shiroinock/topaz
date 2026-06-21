# 0632 - Class field compound assignment snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.165

## Context

[0629](./0629-class-field-assignment-snapshot-leaves.md) accepted simple
concrete class field `=` assignment snapshot leaves, and
[0631](./0631-local-compound-assignment-snapshot-leaves.md) accepted local
identifier compound assignment leaves. The next self-hosting-shaped gap is a
safe concrete class field compound assignment between two awaited operands, for
example `await left + (box.value += 2) + await right`.

Concrete class fields already lower through C lvalues, and existing expression
emission returns the assigned value for numeric compound assignment. That makes
the whole expression suitable for the current snapshot model: evaluate it once
before the later await, store the resulting value, and read the stored value
after resume.

## Decision

Compound assignment expressions with no nested await are snapshot leaves when
their operator is one of `+=`, `-=`, `*=`, `/=`, or `%=` and their target is a
safe concrete class field accepted by the existing class-field snapshot target
check. The local identifier compound path remains unchanged, and simple `=`
snapshot leaves keep their existing local, class-field, and array-element
surface.

Rejected alternatives: accepting array element compound snapshot leaves would
need an explicit value-yielding policy for `emitArrayElementCompoundAssignment`;
accepting interface field compound snapshot leaves would need a setter-backed
return-value policy; adding receiver temps for this class-field slice is not
needed because only safe lvalue bases are accepted; introducing a general
target-reference abstraction or expression IR is broader than this phase.

## Implementation

- `src/codegen.ts:8872` keeps compound snapshot leaves behind the existing
  lowerable compound operator gate.
- `src/codegen.ts:8873` preserves local identifier compound snapshot behavior.
- `src/codegen.ts:8874` accepts property-access compound targets only through
  `isClassFieldSnapshotAssignmentTarget`, which rejects optional access,
  unsafe bases, non-class receivers, and missing fields.
- `src/codegen.ts:8875` keeps interface and array element compound assignment
  targets deferred as snapshot leaves.
- `tests/smoke.sh:3152` promotes the class field compound fixture to a
  positive source-order regression.
- `tests/smoke.sh:3153` adds the interface field compound deferred regression,
  while the existing array element compound deferred regression stays in place.

## Consequences

- **Accepted**:
  `examples/await_binary_class_field_compound_assignment_side_effect_deferred_fail.ts`
  now proves `await Promise.resolve(10) + (box.value += 2) + await
  Promise.resolve(30)` mutates the field before the second await and returns
  `43`.
- **Rejected**:
  `examples/await_binary_interface_field_compound_assignment_side_effect_deferred_fail.ts`
  and `examples/await_binary_array_element_assignment_compound_deferred_fail.ts`
  remain pinned to `await expression lowering is deferred`.
- **Regression count**: smoke covers 701 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: runtime helpers, scheduler work, thenable support, receiver-temp
  materialization, optional targets, nested await in the compound expression,
  array element value-yielding semantics, interface setter value semantics, and
  general expression IR remain out of scope.
