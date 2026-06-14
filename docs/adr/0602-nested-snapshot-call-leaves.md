# 0602 - Nested snapshot call leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.135

## Context

[0601](./0601-awaited-nested-call-receivers.md) connected awaited nested
receivers to the recursive nested call-argument descriptor tree, but binary
call-argument snapshot leaves still treated every side-effectful `call_expr`
leaf as either an await-free value snapshot or a deferred frontier. That kept
the next self-hosting shape blocked when a descriptor-backed outer call consumed
`await left + wrap(await inner)` and still had later outer sibling awaits whose
source order needed to remain visible in the shared `callArgEvents` stream.

## Decision

Keep `tryBuildMultiAwaitCallArgExpression` as the owner of call-argument event
ordering and extend the existing recursive nested-call plan for binary snapshot
leaves. A non-short-circuit binary call argument now uses a call-argument-only
leaf collector that can mark an awaited `call_expr` leaf as `nested_call`; that
leaf is resolved through the same nested descriptor path as direct nested
arguments, materialized after its child awaits, and replaced with the nested
result temp inside the owning binary expression. Rejected alternatives: a
general expression-decomposition IR is still too broad, ordinary await-free
snapshot calls keep the 5.129 value snapshot rule, and optional/spread,
constructor, element, object/array literal, assignment/update/new, and
short-circuit leaves remain deferred.

## Implementation

- `src/codegen.ts:266` adds the `nested_call` binary leaf event without changing
  the outer `callArgEvents` event union.
- `src/codegen.ts:6595` lets nested call arguments use the call-argument binary
  collector and count awaits contributed by nested call leaves.
- `src/codegen.ts:6635` recursively plans nested-call leaves inside a nested
  binary argument, replaces the leaf with the child result temp, and schedules
  the child materialization in source order.
- `src/codegen.ts:6782` applies the same nested-call leaf handling to outer
  binary call arguments.
- `src/codegen.ts:7821` keeps the awaited-call-leaf collector local to
  call-argument binary lowering, so the standalone binary expression planner is
  not broadened.

## Consequences

- **Accepted**: declaration initializer, terminal return, and
  expression-statement discard positions where a descriptor-backed outer call
  has a non-short-circuit binary argument whose `call_expr` leaf contains child
  awaits.
- **Preserved**: direct awaited leaves, await-free snapshot leaves, child nested
  snapshots, child materialization, and later outer sibling awaits all keep the
  existing source-order `callArgEvents` / post-await materialized-temp model.
- **Rejected**: optional/spread/constructor/element calls, assignment/update
  and `new` leaves, short-circuit binary trees, object/array literal snapshot
  leaves, non-direct or multi-await receivers outside the 5.134 rule, and any
  scheduler/runtime changes.
- **Regression**: `async_call_arg_nested_snapshot_leaf_descriptor_await` proves
  left await before nested leaf await, nested materialization before the outer
  binary is consumed, recursive nested snapshot-leaf materialization, and a
  later outer sibling await.
- **Regression**: `await_call_arg_nested_snapshot_object_leaf_deferred_fail`
  pins object-literal snapshot-leaf decomposition as the next deferred frontier.
- **Regression count**: smoke covers 677 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
