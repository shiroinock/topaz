# 0611 - Array literal spread evaluation plan

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.144

## Context

[0610](./0610-descriptor-local-contextual-array-spread-literal-leaves.md)
allowed descriptor-local literal array spread leaves, but intentionally kept
non-literal spread sources deferred. The synchronous array-literal spread
lowering still analyzed spread sources inline inside `emitArrayLiteral`, which
left no named boundary for a later async phase to materialize awaited
spread-source leaves.

## Decision

Keep final synchronous array literal emission inside `emitArrayLiteral`, but
split spread handling through an explicit source-order plan. Fixed elements and
spread-source operations are separate plan steps, and each spread step records
the source expression, inferred source type, element type, source temp name, and
C array symbol used by the existing copy loop. Rejected alternatives: accepting
`...[items(await ...)]` immediately (crosses into async descriptor
materialization), adding a general expression-evaluation IR (too broad), adding
one-off ephemeral descriptors (not a reusable boundary), or touching scheduler,
Promise, object spread, Set/Iterator spread, call/new argument spread, or
for-await behavior.

## Implementation

- `src/codegen.ts:277` adds `ArrayLiteralSpreadPlanStep` and
  `ArrayLiteralSpreadPlan` as the local descriptor shape.
- `src/codegen.ts:14582` keeps allocation/reserve/append in
  `emitArrayLiteral`, but delegates spread analysis to the named plan builder.
- `src/codegen.ts:14640` validates each spread source as `Array<T>`, preserves
  existing diagnostics, assigns the source tmp, and returns source-order fixed
  and spread steps.
- `tests/smoke.sh:3318` adds `array_spread_eval_plan` for mixed fixed elements
  and multiple spread-source calls.

## Consequences

- **Accepted**: synchronous mixed array literals such as
  `[0, ...one("left", 1), 2, ...one("right", 3), 4]` keep evaluating spread
  sources once, reserving fixed plus spread lengths, and appending in literal
  order.
- **Preserved**: non-array spread sources still report
  `spread source in array literal must be an Array<T>, got ...`, and element
  mismatches remain anchored to the spread source.
- **Rejected**: non-literal awaited spread sources such as
  `...[items(await Promise.resolve(...))]` still report the deferred await
  diagnostic.
- **Regression**: `array_spread_eval_plan` prints `left`, `right`, `5`, `10`;
  `await_call_arg_nested_snapshot_array_spread_nonliteral_deferred_fail` remains
  a negative regression.
- **Regression count**: smoke covers 695 `run_*` entries.
