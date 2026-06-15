# 0618 - Awaited array-element assignment call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.151

## Context

[0615](./0615-awaited-assignment-call-leaves.md), [0616](./0616-awaited-class-field-assignment-call-leaves.md),
and [0617](./0617-awaited-interface-field-assignment-call-leaves.md)
accepted awaited identifier, concrete class-field, and interface-field
assignment leaves inside non-short-circuit call-argument binaries. The remaining
assignment boundary was `array[index] = await expr`, where ordinary lowering
uses the void-valued array setter helper and the target reference has both a
receiver and an index that must be evaluated before the RHS await.

## Decision

Accept call-argument binary leaves of the form `array[index] = await expr`
when `op === "="`, the target is an element access, the receiver is inside the
existing simple lvalue-base envelope, the index is inside the existing safe
array-index envelope, the target contains no await, the receiver type is
`Array<T>`, the index type-checks as `number`, and the RHS contains exactly one
await that satisfies the existing simple replacement envelope. The planner
stores both the receiver and index through async-frame temps before suspending
on the RHS await, then materializes a post-await expression that stores the RHS
value, calls `topaz_array_<T>_set(receiverTemp, indexTemp, valueTemp)`, and
returns `valueTemp` as the assignment expression value. Rejected alternatives:
ordinary `emitExpression(assign)` would feed the void setter result into the
binary, globally changing array assignment to be value-returning is broader than
this async slice, compound assignments require old-value reads and operator
typing, side-effectful receiver/index expressions need a larger reference
evaluation policy, and a general expression IR or runtime scheduler remains out
of scope.

## Implementation

- `src/codegen.ts:174` extends the materialized assignment descriptor with an
  array-element variant and index-temp fields.
- `src/codegen.ts:6090` validates array-element assignment leaves, snapshots the
  receiver and index, and type-checks the RHS against the array element type.
- `src/codegen.ts:7434` attaches assignment receiver/index temps to the same
  planned call-argument await step that awaits the RHS.
- `src/codegen.ts:8960` stores return/initializer index temps in the async frame
  before the RHS await, matching the existing statement path.
- `src/codegen.ts:9060` emits the post-await setter-then-value expression so the
  surrounding binary sees the assigned RHS value instead of the setter result.
- `examples/await_call_arg_assignment_array_element_deferred_fail.ts:49`
  now proves receiver snapshot, index snapshot, RHS await ordering, mutation,
  and assigned-value contribution.
- `examples/await_call_arg_assignment_array_element_compound_deferred_fail.ts:19`
  pins compound array-element assignment leaves at the deferred diagnostic.

## Consequences

- **Accepted**: array-element `receiver[index] = await expr` leaves in narrow
  non-short-circuit call-argument binaries.
- **Preserved**: identifier, class-field, and interface-field assignment leaves;
  ordinary void-valued array setter semantics; source-order later arguments; and
  deferred diagnostics for unsupported assignment targets.
- **Rejected**: compound array-element assignments, target expressions
  containing await, side-effectful receiver/index expressions, structural
  thenables, scheduler changes, and general expression decomposition.
- **Regression count**: smoke covers 690 `run_case` / `run_module_case` /
  `run_fail_case` entries, including the promoted array-element fixture and the
  new compound deferred fixture.
