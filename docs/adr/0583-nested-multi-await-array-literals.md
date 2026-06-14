# 0583 - Nested multi-await array literals

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.116

## Context

[5.112](./0579-multi-await-array-literals.md) connected root array literals
whose direct elements were all simple awaits to the ordered async-frame
multi-await planner. That left nested `Array<Array<T>>` literals pinned even
when every leaf was still a direct awaited payload. The self-hosting path needs
that nested literal shape without broadening into arbitrary expression
decomposition, side-effectful sibling capture, or scheduler/runtime changes.

## Decision

Make the array-literal collector recursive. The planner still starts only from a
paren-unwrapped root `array_lit`, but each normal element may now be another
array literal. Leaves must unwrap directly to simple `await` expressions, and
await operands may not contain nested awaits. The existing temp-replacement plan
still declares `<tempPrefix>_0`, `<tempPrefix>_1`, ... in source order and then
lets the transformed nested array literal flow through ordinary array literal
typing and contextual expected-type checks.

Rejected alternatives: accepting mixed non-await leaves would require
side-effect and evaluation-order capture policy; spreads need snapshot/reserve
semantics across suspension; object/array mixed recursion depends on object
literal contextual typing policy; nested calls and general expression forms
belong to separate call-root and decomposition slices.

## Implementation

- `src/codegen.ts:5360`, `src/codegen.ts:5535`, and `src/codegen.ts:5632`
  keep initializer, expression-statement, and terminal-return dispatch through
  `tryBuildMultiAwaitArrayLiteralExpression`.
- `src/codegen.ts:6728` changes `collectMultiAwaitArrayLiteralElements` to
  delegate to a recursive leaf collector that rejects empty arrays, spreads,
  non-await leaves, and awaited operands containing awaits.
- `src/codegen.ts:6999` continues to let `replaceAwaitExprInExpr` rebuild
  nested array literals with awaited leaves replaced by frame temps.
- `examples/async_array_literal_multiple_await.ts:8` now covers nested array
  declaration initializers, terminal returns, and expression-statement discards
  with observable source-order await operands and FIFO continuation order.
- `examples/await_return_expr_deferred_fail.ts:8` now pins a mixed non-await leaf
  inside a nested array return as the nearest deferred boundary.

## Consequences

- **Accepted**: nested all-await-leaf array literals in the three existing
  top-level async-frame expression positions.
- **Preserved**: ordered suspension, non-void awaited payload checks, ordinary
  array literal inference, contextual `Array<Array<T>>` annotations, async-frame
  completion, and the existing Promise ABI and scheduler.
- **Rejected**: spread elements, mixed non-await leaves, object/array mixed
  recursive decomposition, nested call-argument awaits, logical/nullish/ternary
  decomposition, assignment/update/new decomposition, and try/catch/finally
  await.
- **Regression**: `async_array_literal_multiple_await` proves the accepted
  nested shape; `await_return_expr_deferred_fail` keeps mixed nested leaves
  deferred; `await_initializer_multiple_deferred_fail` continues to pin spread.
- **Regression count**: smoke still covers 653 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
