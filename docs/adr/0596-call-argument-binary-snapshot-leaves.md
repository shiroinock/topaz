# 0596 - Call-argument binary snapshot leaves

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.129

## Context

[0581](./0581-multi-await-binary-call-arguments.md) and
[0582](./0582-multi-await-synthetic-binary-call-arguments.md) connected a
single all-await binary call argument to the ordered call-argument planner.
[0592](./0592-side-effectful-binary-await-snapshots.md) then introduced
source-order snapshot temps for value-returning call leaves in top-level
binary roots, and [0593](./0593-side-effectful-array-await-snapshots.md)
through [0595](./0595-contextual-object-nested-snapshot-inheritance.md) reused
that policy for array and contextual object roots. The remaining narrow gap is
`fn(await a + side() + await b)` when the whole binary tree is the one already
accepted call argument.

## Decision

Reuse the existing `MultiAwaitLeafEvent` and `AwaitSnapshotTemp` machinery in
`tryBuildMultiAwaitCallArgExpression`. A single non-short-circuit binary call
argument may now mix direct/simple awaited leaves, conservative pure leaves,
and conservative value-returning `call_expr` snapshot leaves. Snapshot calls
before a later awaited leaf are evaluated on that following suspension step via
`preAwaitSnapshotTemps`; snapshot calls after the final awaited leaf remain in
the transformed binary argument and run during final descriptor-owned call
emission.

Rejected alternatives: a general argument-list event collector is still
deferred because sibling argument snapshots need their own ordering policy;
nested call roots, optional/spread calls, constructor calls, element calls,
assignment/update/new leaves, and nested awaits inside snapshot calls still
need separate decomposition rules. Scheduler/runtime behavior and
PromiseLike/thenable assimilation are unchanged.

## Implementation

- `src/codegen.ts:6447` records source-order binary leaf events for the one
  binary call argument instead of using the older await-only collector.
- `src/codegen.ts:6490` allocates snapshot temps, infers their value type, and
  replaces pre-final snapshot calls with temp identifiers in the transformed
  binary argument.
- `src/codegen.ts:6550` attaches each pending snapshot temp list to the next
  awaited step, leaving arity, typing, void diagnostics, receiver temps, and
  final emission on the existing ordinary call plan.
- `examples/async_call_arg_binary_side_effect_snapshot_multiple_await.ts`
  covers declaration initializer, terminal return, and statement discard
  positions across ordinary calls and `String.fromCharCode`.
- Existing synthetic/builtin deferred samples now pin assignment leaves as the
  nearest still-deferred binary frontier.
- `MEMO.md:522` records the 5.129 roadmap item.

## Consequences

- **Accepted**: single binary call arguments such as
  `combine(await left() + mark("middle", 2) + await right())` across the
  descriptor-backed call surfaces already accepted by 5.114 and 5.115.
- **Preserved**: descriptor-owned call emission and diagnostics, exactly-once
  final calls, post-final-await snapshot timing, async-frame scheduling, and
  current Promise/PromiseLike behavior.
- **Rejected**: multiple binary arguments, argument-list sibling snapshot
  planning, optional/spread calls, nested call roots, assignment/update/new
  leaves, nested awaits inside snapshot calls, and short-circuit binary trees.
- **Regression**: `async_call_arg_binary_side_effect_snapshot_multiple_await`
  proves source-order pre-await snapshots and final-emission snapshots;
  the synthetic/builtin deferred samples keep assignment leaves rejected.
- **Regression count**: smoke covers 670 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
