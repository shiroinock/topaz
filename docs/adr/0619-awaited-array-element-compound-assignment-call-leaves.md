# 0619 - Awaited array-element compound assignment call leaves

- **Status**: Accepted
- **Date**: 2026-06-16
- **Phase**: 5.152

## Context

[0618](./0618-awaited-array-element-assignment-call-leaves.md) accepted
`array[index] = await expr` leaves inside non-short-circuit call-argument
binaries, but deliberately left `array[index] += await expr` deferred because
compound assignment needs the old element value. The selected semantics for this
phase are option B: evaluate and snapshot the receiver, index, and old element
before suspending on the RHS await. Reading the old element after resumption
would observe mutations performed by the awaited RHS and would not match the
chosen source-order boundary.

## Decision

Accept call-argument binary leaves whose assignment owner is an element-access
compound assignment with an existing supported compound operator. The target
must be `elem_access`, the receiver and index must satisfy the existing safe
lvalue/index envelopes, the target must contain no await, the receiver must
type-check as `Array<T>`, and the RHS must contain exactly the matched await
inside the existing simple replacement envelope. The planner stores receiver and
index temps before the RHS await, stores a new old-value temp from
`topaz_array_<T>_at(receiverTemp, indexTemp)`, then post-await computes `next`
from that old value and the awaited RHS, calls `topaz_array_<T>_set`, and
returns `next` as the compound assignment expression value. Rejected
alternatives: reusing ordinary `emitArrayElementCompoundAssignment` would read
the old value after the RHS await, broadening the leaf to identifier/class/interface
compound targets is separate policy, and a general expression IR or scheduler
rewrite is outside this phase.

## Implementation

- `src/codegen.ts:174` adds old-value and operator metadata to materialized
  assignment temps and a dedicated array-element compound assignment leaf.
- `src/codegen.ts:6106` recognizes only safe array-element compound assignment
  leaves, replaces the matched RHS await with the awaited temp, and runs the
  existing assignment type rules through `inferType`.
- `src/codegen.ts:9045` stores compound old-value temps in the async frame after
  receiver/index temps and before suspending on the RHS await.
- `src/codegen.ts:9183` materializes the post-await compound set expression and
  returns `next` to the surrounding binary.
- `src/codegen.ts:14593` shares the existing string `+=`, numeric `%=` and
  arithmetic next-value calculation with ordinary compound lowering.
- `examples/await_call_arg_assignment_array_element_compound_deferred_fail.ts:16`
  now mutates the same array element inside the awaited RHS helper, proving that
  old-value snapshot timing affects the final value.

## Consequences

- **Accepted**: narrow `array[index] += await expr`, `-=`, `*=`, `/=`, and `%=`
  leaves inside supported call-argument binary planning.
- **Preserved**: source-order evaluation, ordinary array setter semantics,
  existing compound typing including string `+=`, and deferred diagnostics for
  unsafe receiver/index or target-side await shapes.
- **Rejected**: post-await old-value reads, non-array compound targets, wider
  awaited assignment leaves, thenable bridging, runtime task queues, and general
  expression scheduling.
- **Regression count**: smoke still covers 690 `run_case` / `run_module_case` /
  `run_fail_case` entries; the former compound deferred fixture is promoted to a
  passing case rather than adding a new boundary fixture.
