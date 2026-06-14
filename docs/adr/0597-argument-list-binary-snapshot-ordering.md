# 0597 - Argument-list binary snapshot ordering

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.130

## Context

[0581](./0581-multi-await-binary-call-arguments.md) and
[0582](./0582-multi-await-synthetic-binary-call-arguments.md) accepted one
binary call argument when every awaited operand lived inside that argument.
[0596](./0596-call-argument-binary-snapshot-leaves.md) then allowed
conservative value-returning call snapshot leaves inside that one binary
argument, but still kept direct awaited sibling arguments deferred. The narrow
remaining gap is `fn(await left() + side(), between(), await right())`, where
the side-effectful tail belongs after the binary await but before the later
sibling await operand.

## Decision

Keep lowering in `tryBuildMultiAwaitCallArgExpression` and extend its local
event view from a binary-only event list to an argument-list event list. The
call may contain at most one non-short-circuit binary argument plus direct
`await` sibling arguments; binary snapshot leaves are attached to the next
awaited event in source order across the whole call. Rejected alternatives:
multiple binary arguments remain deferred because they need a broader
argument-list decomposition policy; nested call roots and optional/spread calls
remain deferred because `resolveOrdinaryCallPlan` should continue to own arity,
typing, descriptor diagnostics, and final call emission.

## Implementation

- `src/codegen.ts:6450` builds `callArgEvents` while scanning arguments,
  allowing one binary argument to coexist with direct awaited siblings and
  relaxing the binary-local await count to one when the full call has later
  awaited events.
- `src/codegen.ts:6496` carries pending binary snapshot leaves until the next
  awaited event in the full argument list, replacing only snapshots that have
  such a later event and leaving post-final snapshots in final emission.
- `src/codegen.ts:7565` emits pre-await sibling argument temps and snapshot
  temps in source-position order, so a binary tail snapshot before a later
  sibling argument still runs before that sibling temp and await operand.
- `examples/async_call_arg_binary_snapshot_sibling_multiple_await.ts` covers
  declaration initializer, terminal return, and expression-statement discard
  positions with exactly-once final descriptor calls.
- `examples/await_call_arg_multiple_binary_deferred_fail.ts` pins the nearest
  still-deferred frontier: two binary awaited arguments in one call.

## Consequences

- **Accepted**: one binary call argument with direct/simple await leaves,
  conservative pure leaves, value-returning snapshot call leaves, and direct
  awaited sibling arguments before or after it.
- **Preserved**: descriptor-owned ordinary call planning, receiver/pre-argument
  temps, void diagnostics, final call emission, scheduler behavior, and
  PromiseLike/thenable behavior.
- **Rejected**: multiple binary arguments, nested call roots, optional/spread
  calls, constructor/element calls, assignment/update/new leaves, nested awaits
  inside snapshot calls, and short-circuit binary trees.
- **Regression**: `async_call_arg_binary_snapshot_sibling_multiple_await`
  proves argument-list source ordering; `await_call_arg_multiple_binary_deferred_fail`
  keeps the multiple-binary frontier deferred.
- **Regression count**: smoke covers 669 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
