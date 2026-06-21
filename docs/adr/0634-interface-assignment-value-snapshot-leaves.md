# 0634 - Interface assignment value snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.167

## Context

[0629](./0629-class-field-assignment-snapshot-leaves.md) accepted concrete
class field assignment snapshot leaves, [0632](./0632-class-field-compound-assignment-snapshot-leaves.md)
accepted class field compound assignment leaves, and
[0633](./0633-array-element-compound-assignment-snapshot-leaves.md) completed
the array element compound side. Interface fields remained the setter-backed
outlier: vtable setters return void, so direct interface assignment emission
did not yield the assigned value even though `inferType(assign_expr)` treats
assignment expressions as value-producing.

## Decision

Setter-backed interface assignment expressions now have normal assignment
value semantics. Simple `slot.value = rhs` evaluates the RHS once into a typed
temporary, calls the interface setter with that temporary, and yields it.
Lowerable compound assignments compute `nextTmp`, call the setter, and yield
`nextTmp`. Safe interface field assignment expressions can therefore act as
snapshot leaves in existing multi-await binary lowering.

Rejected alternatives: accepting only interface compound assignment snapshot
leaves would leave simple interface assignment as the only setter-backed void
assignment expression; keeping setter-backed assignment void would disagree
with local, class field, and array element assignment values; materializing
unsafe receivers would need a separate receiver-decomposition design; update
expressions still need distinct prefix/postfix value semantics.

## Implementation

- `src/codegen.ts:8877` and `src/codegen.ts:8887` allow property-access
  snapshot assignment targets when they are safe class fields or safe
  interface fields.
- `src/codegen.ts:8911` adds the interface field snapshot target predicate,
  rejecting optional access, unsafe receiver bases, non-interface receivers,
  and missing interface fields.
- `src/codegen.ts:15112` makes interface field compound assignment yield the
  computed `nextTmp` after the setter call.
- `src/codegen.ts:15504` makes simple interface field assignment store the RHS
  in a typed value temporary, pass that temporary to the setter, and yield it.
- `tests/smoke.sh:3147` promotes the simple interface assignment binary
  snapshot fixture to a positive source-order regression.
- `tests/smoke.sh:3148` pins unsafe interface receiver targets to deferred
  await lowering.
- `tests/smoke.sh:3155` promotes the interface compound assignment binary
  snapshot fixture to a positive source-order regression.

## Consequences

- **Accepted**:
  `examples/await_binary_interface_assignment_side_effect_deferred_fail.ts`
  now proves `await Promise.resolve(1) + (slot.value = 2) + await
  Promise.resolve(3)` mutates the slot before the second await and returns `6`.
  `examples/await_binary_interface_field_compound_assignment_side_effect_deferred_fail.ts`
  proves the same ordering for `slot.value += 2` and returns `43`.
- **Rejected**:
  `examples/await_binary_interface_assignment_side_effect_receiver_deferred_fail.ts`
  keeps `(makeSlot()).value = expr` deferred because the receiver is not a safe
  lvalue base.
- **Regression count**: smoke covers 706 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: runtime helpers, scheduler work, thenable support, unsafe
  receiver decomposition, update expressions, nested await in assignment
  expressions, and general expression IR remain out of scope.
