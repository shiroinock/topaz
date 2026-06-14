# 0575 - Multi-await binary return

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.108

## Context

Phase 5.107 proved that a root binary `+` with one direct awaited operand on
each side can be decomposed into ordered async-frame suspension steps for
declaration initializers. Terminal returns already use `AwaitReturnInfo` for
single awaited return expressions and multi-await call-argument plans, so the
next smallest compatibility step is to feed the same two-step binary plan into
the final return branch without changing the Promise ABI.

## Decision

Accept only terminal `return` expressions whose paren-unwrapped root is binary
`+` and whose left and right operands are each one direct/simple `await`.
The left await source suspends first, the right await source is evaluated only
after the left resume, and the transformed binary return expression is emitted
once after the right resume with the async function payload type as context.

Rejected alternatives: nested/general expression decomposition would require a
broader expression planner; logical / nullish / ternary / assignment / update /
object / array / `new` decomposition is outside this slice; widening
expression-statement or declaration-initializer behavior would reopen phase
5.107; scheduler and Promise ABI changes are unnecessary because the existing
async frame continuation already preserves the needed ordering.

## Implementation

- `src/codegen.ts:5353` keeps declaration-initializer binary `+` multi-await
  lowering on the shared planner path.
- `src/codegen.ts:5608` tries that shared binary planner before the existing
  call-argument multi-await planner in the terminal return branch.
- `src/codegen.ts:6547` renames the initializer-specific planner to
  `tryBuildMultiAwaitBinaryExpression` and keeps the accepted shape to a root
  `+` with exactly one direct awaited left operand and one direct awaited right
  operand.
- `examples/async_return_binary_multiple_await.ts` covers async function
  declarations, async arrows, async class methods, anonymous async function
  expressions, number `+`, string `+`, and observable right-operand evaluation
  after the first await resumes.
- `examples/await_return_expr_deferred_fail.ts` now pins nested binary return
  decomposition as still deferred.

## Consequences

- **Accepted**: terminal `return (await left) + (await right);` in async-frame
  bodies when both payloads are non-void and the transformed expression
  type-checks against the async payload type.
- **Preserved**: left-to-right suspension order, single final return emission,
  existing return call-argument multi-await behavior, and the existing Promise
  runtime / scheduler ABI.
- **Rejected**: nested binary trees, general expression decomposition,
  non-`+` operators, side-effectful non-await sibling capture, non-terminal
  returns, and `await` inside try/catch/finally.
- **Regression**: `async_return_binary_multiple_await` proves the accepted
  return shape across async function forms, and `await_return_expr_deferred_fail`
  keeps nested return decomposition outside this phase.
- **Regression count**: smoke now covers 639 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
