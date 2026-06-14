# 0585 - Mixed-pure multi-await binary trees

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.118

## Context

[5.107](./0574-multi-await-binary-initializer.md)-[5.111](./0578-nested-multi-await-binary-tree.md)
built the shared binary multi-await planner for initializer, terminal return,
and expression-statement positions. [5.114](./0581-multi-await-binary-call-arguments.md)
and [5.115](./0582-multi-await-synthetic-binary-call-arguments.md) reused that
collector for descriptor-backed single binary call arguments. The remaining
mixed-leaf fail pins need an evaluation policy: side-effectful non-await leaves
must eventually run between suspension points, while conservative pure leaves
can be delayed until final completion without changing observable behavior in
the current subset.

## Decision

Extend the shared binary collector to accept leaves that are either direct,
simple `await` expressions or conservative side-effect-free non-await
expressions. Await leaves still become ordered suspension steps and are replaced
with frame temps. Pure non-await leaves are not captured in this phase; they
remain in the transformed expression and are evaluated only when the final
resume emits the completed binary tree.

Rejected alternatives: accepting arbitrary mixed leaves such as calls would
need between-suspension scheduling; adding initializer/return/statement/call
branches would duplicate the decomposition policy; accepting `&&`, `||`, or
`??` would need branch-sensitive continuation state; spread array literals and
runtime scheduler changes remain separate decisions.

## Implementation

- `src/codegen.ts:6654` rejects accidental binary plans with fewer than two
  awaited leaves before allocating frame temps.
- `src/codegen.ts:6797` lets `collectMultiAwaitBinaryTreeLeaves` pass a pure
  non-await leaf without recording a suspension step.
- `src/codegen.ts:6806` defines the conservative pure subset: identifiers,
  scalar/null/undefined literals, `this`, parenthesized/non-null/type-assertion
  wrappers, non-mutating prefix and `typeof`, non-short-circuit binary trees,
  and non-optional property access over a pure receiver.
- `examples/async_binary_mixed_pure_multiple_await.ts:21` covers initializer,
  terminal return, expression-statement discard, and descriptor-backed single
  binary call argument shapes with observable await operand order.
- `examples/await_binary_mixed_side_effect_deferred_fail.ts:8` keeps a
  side-effectful mixed leaf between awaited leaves pinned to the deferred await
  diagnostic.

## Consequences

- **Accepted**: non-short-circuit multi-await binary trees that mix direct
  awaited leaves with conservative pure non-await leaves.
- **Preserved**: await operand ordering, descriptor-backed call restrictions,
  no temp capture for pure leaves, no Promise ABI changes, and no scheduler
  changes.
- **Rejected**: calls, optional chains, element access, object/array literals,
  assignment/update/new, spread, ternary, logical/nullish short-circuit,
  side-effectful mixed leaves, and nested awaits outside direct await leaves.
- **Regression**: `async_binary_mixed_pure_multiple_await` proves the accepted
  mixed-pure shapes; `await_binary_mixed_side_effect_deferred_fail` preserves
  the side-effectful mixed-leaf rejection.
- **Regression count**: smoke covers 651 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
