# 0586 - Mixed-pure multi-await array literals

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.119

## Context

[5.112](./0579-multi-await-array-literals.md) and
[5.116](./0583-nested-multi-await-array-literals.md) established ordered
multi-await lowering for root array literals whose nested leaves were all
direct/simple `await` expressions. [5.118](./0585-mixed-pure-multi-await-binary-trees.md)
then established that conservative side-effect-free non-await leaves can stay
inside the transformed expression and be evaluated only at final completion.
Array literals need the same mixed-pure policy for initializer, terminal return,
and expression-statement discard positions.

## Decision

Share the conservative pure-leaf predicate between binary and array literal
multi-await planners. The array collector now accepts nested array literals,
direct/simple `await` leaves, and conservative pure non-await leaves. Awaited
leaves still become frame temps in source order; pure leaves are not captured
and remain in the final transformed array literal.

Rejected alternatives: accepting arbitrary calls or element access would need a
between-suspension side-effect/snapshot policy; accepting spread would need
reserve and iteration snapshot semantics; recursing into object literals would
mix in contextual object typing policy; accepting ternary, `&&`, `||`, or `??`
would need branch-sensitive continuation state; duplicating the binary pure
predicate would create policy drift.

## Implementation

- `src/codegen.ts:6761` keeps the array planner rooted at a paren-unwrapped
  array literal and recursively walks only normal elements.
- `src/codegen.ts:6770` records direct/simple awaited leaves as ordered
  suspension steps and rejects nested awaits in awaited operands.
- `src/codegen.ts:6775` lets conservative pure non-await leaves pass through
  without adding frame temps.
- `src/codegen.ts:6809` renames the binary-only predicate into the shared
  `isSideEffectFreeMultiAwaitLeaf` policy used by both collectors.
- `examples/async_array_literal_mixed_pure_multiple_await.ts:16` covers
  initializer, terminal return, and expression-statement discard shapes with
  identifier, non-short-circuit binary, and non-optional property pure leaves.
- `examples/await_array_literal_mixed_side_effect_deferred_fail.ts:8` keeps a
  call leaf between awaited leaves pinned to the existing deferred await
  diagnostic.

## Consequences

- **Accepted**: nested array literals that mix direct awaited leaves with
  conservative pure non-await leaves in async-frame initializer, terminal
  return, and expression-statement discard positions.
- **Preserved**: source-order suspension, FIFO continuation behavior, no pure
  leaf temp capture, no runtime or Promise ABI changes, and the existing minimum
  of at least two awaited leaves for multi-await planning.
- **Rejected**: spreads, side-effectful calls/method calls/constructors/element
  access, object literal recursion, assignment/update/new, ternary,
  logical/nullish short-circuiting, nested awaits outside direct await leaves,
  and void awaited payloads.
- **Regression**: `async_array_literal_mixed_pure_multiple_await` proves the
  mixed-pure accepted shape; `await_array_literal_mixed_side_effect_deferred_fail`
  preserves the side-effectful mixed-leaf rejection.
- **Regression count**: smoke covers 651 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
