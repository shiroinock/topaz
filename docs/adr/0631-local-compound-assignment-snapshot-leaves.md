# 0631 - Local compound assignment snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.164

## Context

[0628](./0628-local-assignment-snapshot-leaves.md) accepted local `=`
assignment leaves in side-effectful multi-await binary lowering, and
[0630](./0630-array-element-assignment-snapshot-leaves.md) extended the same
snapshot path to safe array element `=` assignment. Compound assignment leaves
are split by target shape: a local identifier is already a C lvalue whose
compound assignment expression yields the assigned value, while class,
interface, and array targets carry receiver, setter, or element-update
semantics that need a separate value-yielding design before they can be used as
snapshot values.

## Decision

Identifier compound assignment expressions with no nested await are snapshot
leaves when the operator is one of `+=`, `-=`, `*=`, `/=`, or `%=`. The
snapshot planner still evaluates the expression once at the original source
position and later reads the saved value, so existing expression emission and
compound-assignment type checks remain authoritative.

Rejected alternatives: accepting class field compound assignment in this phase
would widen beyond the local C-lvalue slice; accepting interface field compound
assignment would require a return-value policy for setter-backed writes;
accepting array element compound assignment would require making its helper
yield the computed next value; introducing a target-reference abstraction or
general expression IR is broader than this phase needs.

## Implementation

- `src/codegen.ts:8868` keeps the existing nested-await rejection at the
  snapshot-leaf front door.
- `src/codegen.ts:8871` unwraps the assignment target before operator
  dispatch, so parenthesized identifier targets use the same gate.
- `src/codegen.ts:8872` accepts only lowerable compound-assignment operators
  whose target is an identifier.
- `src/codegen.ts:8873` leaves simple `=` snapshot behavior for local,
  class-field, and array-element targets unchanged.
- `src/codegen.ts:9558` restores identifier assignment snapshot values into
  the resumed local after the following await, covering both `=` and accepted
  compound operators.
- `tests/smoke.sh:3151` adds the positive source-order regression for
  `(value += 2)` between two awaited operands.
- `tests/smoke.sh:3152` pins concrete class field compound assignment leaves
  to the deferred boundary.

## Consequences

- **Accepted**:
  `examples/await_binary_local_compound_assignment_side_effect_snapshot.ts`
  proves that `await Promise.resolve(10) + (value += 2) + await
  Promise.resolve(30)` prints the mutated local value once and returns `43`.
- **Rejected**:
  `examples/await_binary_class_field_compound_assignment_side_effect_deferred_fail.ts`
  remains deferred, and the existing
  `examples/await_binary_array_element_assignment_compound_deferred_fail.ts`
  boundary is unchanged.
- **Regression count**: smoke covers 703 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: runtime helpers, scheduler work, thenable support,
  receiver/index/setter temp design, optional targets, nested-await RHS
  assignment handling, and general expression IR remain out of scope.
