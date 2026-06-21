# 0630 - Array element assignment snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.163

## Context

[0628](./0628-local-assignment-snapshot-leaves.md) accepted simple local
`=` assignment leaves through the shared `AwaitSnapshotTemp` path, and
[0629](./0629-class-field-assignment-snapshot-leaves.md) did the same for
concrete class field assignment. The next small gap is array element
assignment. Unlike interface setters, `topaz_array_*_set(...)` returns the
assigned value, so a whole `(values[i] = next)` expression can be evaluated
once at the snapshot point and replaced by the saved value later.

## Decision

Simple array element `=` assignment expressions with no nested await are
snapshot leaves when the receiver is a safe lvalue base, the index is a safe
array index expression, the receiver type is `Array<T>`, and the index is
number-compatible. They continue to use the neutral `AwaitSnapshotTemp`
store/restore path, relying on existing assignment emission for RHS typing and
the runtime array-set value result.

Rejected alternatives: adding an array-assignment-specific event, receiver
temp, or index temp would duplicate materialization machinery without being
needed for this safe receiver/index slice; interface field assignment,
compound/update forms, `new`, assignment-with-await, unsafe receiver/index
decomposition, optional calls, spread, short-circuit decomposition, scheduler,
thenable, runtime, and general IR work remain deferred.

## Implementation

- `src/codegen.ts:8868` keeps the shared nested-await and `op === "="` gates
  in `isSnapshotMultiAwaitLeaf(...)`, preserving identifier and class-field
  assignment behavior.
- `src/codegen.ts:8875` routes element-access assignment targets into the new
  array-element predicate before emitting the existing `snapshot` event.
- `src/codegen.ts:8896` requires safe receiver and index forms, an `Array<T>`
  receiver, and a number-compatible index.
- `tests/smoke.sh:3148` promotes the former array element assignment deferred
  fixture to a positive source-order regression.
- `tests/smoke.sh:3149` and `tests/smoke.sh:3150` pin unsafe index and
  compound array element assignment leaves on the deferred boundary.

## Consequences

- **Accepted**:
  `examples/await_binary_array_element_assignment_side_effect_deferred_fail.ts`
  now proves the assignment value participates in the binary result and the
  array element is mutated exactly once.
- **Rejected**:
  `examples/await_binary_interface_assignment_side_effect_deferred_fail.ts`,
  `examples/await_binary_array_element_assignment_side_effect_index_deferred_fail.ts`,
  and `examples/await_binary_array_element_assignment_compound_deferred_fail.ts`
  remain deferred.
- **Regression count**: smoke covers 698 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: runtime, Promise ABI, scheduler, thenable assimilation,
  receiver/index decomposition, optional/spread/short-circuit work, and
  general expression IR remain out of scope.
