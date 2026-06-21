# 0629 - Class field assignment snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.162

## Context

[0628](./0628-local-assignment-snapshot-leaves.md) accepted simple local
`=` assignment leaves through the shared `AwaitSnapshotTemp` path. The next
small gap is concrete class field assignment: `(box.value = next)` lowers to a
C lvalue assignment with a value result, and it does not need a separate
receiver or index temp when the whole assignment expression is evaluated as the
snapshot expression. Interface field assignment and array element assignment
use different C lowering strategies, so they remain separate decisions.

## Decision

Simple concrete class field `=` assignment expressions with no nested await are
snapshot leaves when the property receiver is an existing safe lvalue base and
the receiver type resolves to a registered class containing the target field.
They continue to use the neutral `AwaitSnapshotTemp` store/restore path: the
assignment expression is evaluated once before the later awaited leaf, and the
transformed expression tree reads the stored assignment value.

Rejected alternatives: adding a property-assignment-specific event would
duplicate snapshot handling without adding state; receiver temps would be
unnecessary for this safe-base slice; interface field assignment, array element
assignment, compound/update forms, `new`, assignment-with-await, optional
access, spread, short-circuit, scheduler, thenable, runtime, and general IR
work remain deferred.

## Implementation

- `src/codegen.ts:8868` keeps nested-await and `op === "="` checks in the
  shared `isSnapshotMultiAwaitLeaf(...)` predicate, preserving identifier
  assignment behavior from 5.161.
- `src/codegen.ts:8874` delegates property assignment leaves to a concrete
  class-field target check instead of accepting interface or element writes.
- `src/codegen.ts:8884` rejects optional access, unsafe receivers, non-class
  receivers, unknown classes, and missing fields before the existing snapshot
  event can be emitted.
- `tests/smoke.sh:3146` promotes
  `await_binary_property_assignment_side_effect_deferred_fail` to a positive
  source-order regression with output `2` then `6`.
- `tests/smoke.sh:3147` and `tests/smoke.sh:3148` pin interface field and
  array element assignment leaves on the deferred await-lowering boundary.

## Consequences

- **Accepted**:
  `examples/await_binary_property_assignment_side_effect_deferred_fail.ts`
  now proves the assignment value participates in the binary result and the
  class field has the assigned value after the later await.
- **Rejected**:
  `examples/await_binary_interface_assignment_side_effect_deferred_fail.ts`
  and `examples/await_binary_array_element_assignment_side_effect_deferred_fail.ts`
  remain deferred.
- **Regression count**: smoke covers 698 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: interface setters, array receiver/index snapshots, compound and
  update assignments, RHS awaits, unsafe receivers, optional access, spread,
  short-circuit decomposition, PromiseLike/thenable policy, scheduler/runtime
  changes, and general expression IR remain out of scope.
