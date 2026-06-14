# 0598 - Multiple binary call arguments

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.131

## Context

[0597](./0597-argument-list-binary-snapshot-ordering.md) made one
descriptor-backed binary call argument share the same event descriptor with
direct awaited sibling arguments. That preserved source-order snapshot behavior
across argument boundaries, but still rejected calls where two argument roots
were non-short-circuit binary trees even though each tree was already accepted
by the existing binary leaf collector.

## Decision

Keep lowering in `tryBuildMultiAwaitCallArgExpression` and remove only the
single-binary-argument restriction. Each binary argument owns its transformed
expression, while the shared `callArgEvents` stream still attaches snapshot
leaves to the next awaited event in the full argument list. Rejected
alternatives: a general expression planner remains too broad for this slice,
and nested call roots / optional or spread calls remain deferred so
`resolveOrdinaryCallPlan` continues to own arity, typing, descriptor
diagnostics, receiver temps, and final call emission.

## Implementation

- `src/codegen.ts:6450` now records every binary argument index while keeping
  direct awaited arguments in the same ordered `callArgEvents` stream.
- `src/codegen.ts:6490` replaces the former single transformed binary
  expression with an `argIndex -> Expr` map, so snapshot and awaited leaf
  replacement updates the binary argument that actually owns the leaf.
- `src/codegen.ts:6580` builds the signature call from direct await temps,
  per-argument transformed binary expressions, and untouched ordinary
  arguments before handing the full call to `resolveOrdinaryCallPlan`.
- `src/codegen.ts:6705` emits the final transformed call using the same
  per-argument binary map plus existing pre-argument temps.
- `examples/async_call_arg_multiple_binary_snapshot_arguments.ts` covers
  declaration initializer, terminal return, and expression-statement discard
  positions with two binary arguments and a direct awaited sibling argument.
- `examples/await_call_arg_nested_call_binary_deferred_fail.ts` keeps the
  nearest nested call-root frontier deferred.

## Consequences

- **Accepted**: descriptor-backed calls with multiple non-short-circuit binary
  arguments whose leaves are direct/simple awaits, conservative pure leaves,
  and conservative value-returning call snapshots.
- **Preserved**: source-order snapshot transfer across argument boundaries,
  direct awaited sibling arguments, receiver and pre-argument temps, final call
  emission, scheduler behavior, and PromiseLike / thenable behavior.
- **Rejected**: nested call roots, optional/spread calls, constructor/element
  calls, assignment/update/new leaves, nested awaits inside snapshot calls,
  short-circuit binary trees, and scheduler/runtime changes.
- **Regression**: `async_call_arg_multiple_binary_snapshot_arguments` proves
  the newly accepted surface; `await_call_arg_nested_call_binary_deferred_fail`
  pins the next deferred frontier.
- **Regression count**: smoke covers 670 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
