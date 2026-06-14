# 0600 - Recursive nested call argument await descriptors

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.133

## Context

[0599](./0599-nested-call-argument-await-descriptors.md) accepted one-level
nested call argument descriptors and pinned recursive nested calls as the next
frontier. The existing `callArgEvents` stream already models source-order
awaits, snapshots, and post-await materialization events, so the architecture
preserving next step is a recursive call-argument descriptor tree rather than a
second depth-specific special case.

## Decision

Represent nested call arguments as recursive descriptor nodes owned by
`tryBuildMultiAwaitCallArgExpression`. Each nested `call_expr` node still
resolves through `resolveOrdinaryCallPlan`, child nodes materialize into result
temps before their parent node consumes them, and all child awaits, binary
snapshots, and materialization events flow through the same outer
`callArgEvents` stream. Rejected alternatives: a depth-2 shallow special case
would create index/state coupling that has to be removed later, a generic
expression-decomposition IR is too broad for this phase, and awaited nested
receivers remain deferred so the recursive argument tree can land first.

## Implementation

- `src/codegen.ts:275` extends `MultiAwaitNestedCallArgPlan` with dependency
  arg indexes and child nested-call result expressions.
- `src/codegen.ts:6438` makes `tryBuildNestedMultiAwaitCallArgPlan` recursive:
  child calls contribute awaits and materialization events to the parent stream,
  while direct awaits and binary snapshots remain the base cases.
- `src/codegen.ts:6896` resolves nested plans from child to parent, so parent
  signatures and final transformed calls can consume already-declared child
  result temps.
- `src/codegen.ts:7104` preserves receiver/pre-argument temp behavior by
  scheduling parent pre-argument temps before the first dependency await for the
  relevant argument.
- `src/codegen.ts:7307` lets outer pre-argument temps consume a materialized
  nested result temp instead of re-emitting the original nested call expression.

## Consequences

- **Accepted**: recursive descriptor-backed nested call arguments such as
  `f(g(h(await x)), await y)` in declaration initializers, terminal returns, and
  expression-statement discard positions.
- **Preserved**: source-order awaits/snapshots/materialization, ordinary call
  descriptor ownership of arity, typing, receivers, pre-argument temps, and
  final call emission.
- **Rejected**: awaited nested receivers, nested calls inside snapshot leaves,
  optional/spread/constructor/element call variants, short-circuit binary trees,
  and scheduler/runtime changes.
- **Regression**: `async_call_arg_recursive_nested_call_descriptor_await` covers
  three recursive call levels plus a binary/snapshot sibling;
  `await_call_arg_awaited_nested_receiver_deferred_fail` pins the next receiver
  frontier. Older nested-call fail fixtures that became accepted now pin either
  awaited nested receivers or nested snapshot-call leaves instead.
- **Regression count**: smoke covers 678 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
