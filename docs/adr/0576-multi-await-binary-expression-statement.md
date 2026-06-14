# 0576 - Multi-await binary expression statement

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.109

## Context

Phases [5.107](./0574-multi-await-binary-initializer.md) and
[5.108](./0575-multi-await-binary-return.md) proved the narrow ordered binary
`+` plan for declaration initializers and terminal returns. Expression
statements already use `AwaitStatementInfo` for direct awaited statements and
multi-await call-argument statements, so the next smallest syntax-coverage step
is to reuse the same two awaited operand plan where the expression value is
discarded.

## Decision

Accept only top-level async-frame expression statements whose paren-unwrapped
root is binary `+` and whose left and right operands are each one direct/simple
`await`. The left await source suspends first, the right await source is
evaluated after the left resume, and the transformed binary expression is
emitted once as a statement after the right resume.

Rejected alternatives: nested binary trees and general expression decomposition
would require a broader planner; non-`+` operators, logical / nullish / ternary,
assignment / update / object / array / `new`, and side-effectful non-await
sibling capture are outside this narrow slice; changing scheduler, Promise ABI,
thenable, or PromiseLike behavior is unnecessary because the existing async
frame statement path already preserves ordered suspension.

## Implementation

- `src/codegen.ts:5519` now tries `tryBuildMultiAwaitBinaryExpression` before
  the existing multi-await call-argument planner in the expression-statement
  multiple-await branch.
- `src/codegen.ts:6547` keeps the shared binary planner shape constrained to a
  root `+` with exactly one direct awaited left operand and one direct awaited
  right operand, declaring payload temps and rewriting both operands.
- `src/codegen.ts:5531` reuses the existing `AwaitStatementInfo` path with
  `transformedExpr`, empty receiver / index / argument temp arrays, and
  `deferStatementCompletion` set until the final awaited operand resumes.
- `examples/async_expression_statement_binary_multiple_await.ts` covers async
  function declarations, async arrows, async class methods with an explicit
  empty constructor, anonymous async function expressions, number `+`, string
  `+`, discarded expression results, and observable left/right await ordering.

## Consequences

- **Accepted**: `(await left) + (await right);` as a top-level async-frame
  expression statement when both payloads are non-void and the transformed
  binary expression type-checks.
- **Preserved**: existing call-argument multi-await statement behavior remains
  the fallback after the binary shape check.
- **Rejected**: nested/general expression decomposition, non-`+` operators,
  side-effectful non-await sibling capture, non-top-level statements inside
  try/catch/finally, scheduler changes, Promise ABI changes, and thenable or
  PromiseLike behavior changes.
- **Regression**: `async_expression_statement_binary_multiple_await` proves the
  accepted statement shape across async function forms while
  `await_expression_statement_deferred_fail` keeps nested/general expression
  decomposition outside this phase.
- **Regression count**: smoke now covers 643 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
