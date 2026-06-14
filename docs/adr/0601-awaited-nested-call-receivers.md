# 0601 - Awaited nested call receivers

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.134

## Context

[0600](./0600-recursive-nested-call-argument-await-descriptors.md) made nested
call argument descriptors recursive, but still rejected nested property calls
whose receiver was an awaited expression. That left the next self-hosting
frontier at ordinary descriptor-backed calls like
`outer((await receiver).method(await arg), await sibling)`, where the receiver
await must happen before nested argument awaits and before the nested call is
materialized for the outer call.

## Decision

Extend the recursive nested call node rather than adding a receiver-only path.
A nested property call may now have exactly one direct awaited receiver. That
receiver await becomes a normal `awaitedArgs` owner and `callArgEvents` await
event before the nested call argument events. Its resume temp is used as the
nested call signature and final receiver. Rejected alternatives: snapshot-leaf
decomposition remains too broad for this phase, optional/spread/constructor or
element call variants stay outside ordinary call descriptors, and a new generic
expression decomposition IR would widen the scheduler surface without need.

## Implementation

- `src/codegen.ts:253` adds a `nested_receiver` await owner and records the
  optional receiver await index on `MultiAwaitNestedCallArgPlan`.
- `src/codegen.ts:6462` lets `tryBuildNestedMultiAwaitCallArgPlan` accept only
  direct awaited property receivers and rejects non-direct or multi-await
  receiver expressions.
- `src/codegen.ts:6498` resolves the awaited receiver operand, rejects `void`,
  appends the receiver await to the shared event stream, and rewrites the nested
  callee to use the receiver temp.
- `src/codegen.ts:6971` resolves nested signatures against the transformed
  callee, so ordinary call descriptor typing sees the awaited receiver payload.
- `src/codegen.ts:6987` skips the pre-await receiver snapshot machinery for
  awaited nested receivers; the resume temp itself is the final receiver.

## Consequences

- **Accepted**: declaration initializers, terminal returns, and
  expression-statement discards where a descriptor-backed outer call consumes a
  nested property call with a direct awaited receiver.
- **Preserved**: source-order receiver await, nested argument awaits, nested
  materialization, and later outer sibling awaits all remain in the existing
  `callArgEvents` / post-await materialized temp stream.
- **Rejected**: nested calls inside snapshot leaves, optional/spread/constructor
  and element calls, short-circuit binary trees, non-direct receiver awaits, and
  scheduler/runtime changes.
- **Regression**: `async_call_arg_awaited_nested_receiver_descriptor_await`
  covers initializer/return/statement positions plus a recursive parent nested
  call and a later outer sibling await.
- **Regression**: `await_call_arg_nested_snapshot_leaf_deferred_fail` pins the
  next deferred snapshot-leaf frontier.
- **Regression count**: smoke covers 679 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
