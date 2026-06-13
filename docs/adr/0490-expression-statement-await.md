# 0490 - expression-statement await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.23

## Context

ADR [0483](./0483-initializer-expression-await-lowering.md) moved
non-terminal initializer awaits onto the ordered async frame, while ADRs
[0484](./0484-bare-call-argument-await-decomposition.md) through
[0489](./0489-string-number-call-descriptor-await.md) widened call-argument
await only inside declaration initializers and terminal returns. A top-level
`await Promise<T>;` statement is the first non-terminal await surface that does
not need a result value to be threaded into a later expression.

## Decision

Accept exactly top-level expression statements whose expression is an
`await_expr` modulo parentheses inside block-bodied async function
declarations, async arrows, async methods, and anonymous async function
expressions. Lower them as value-discarding async suspension steps: schedule
`topaz_promise_then_into` with the awaited Promise operand, record the original
statement and `pc`, store no fulfilled payload in the frame, and resume at the
following statement segment. Rejected alternatives: general expression
decomposition remains too broad for this phase, and call / assignment
expression-statement await stays deferred because it would mix statement
continuation with call or assignment decomposition in one slice.

## Implementation

- `src/codegen.ts` adds `AwaitStatementInfo` to the async suspension-step union
  with the original `ExprStmt`, `awaitExpr`, statement index, `pc`, and
  operand type.
- `src/codegen.ts` recognizes top-level `expr_stmt` nodes that unwrap directly
  to `await_expr`, checks that the operand is `Promise<T>`, and leaves nested
  expression-statement awaits on the shared unsupported await diagnostic.
- `src/codegen.ts` schedules statement steps through the same first-step and
  next-step `topaz_promise_then_into` path as bindings, initializers, and
  terminal returns, but emits no frame field for the fulfilled payload.
- `src/codegen.ts` discards `source` when a statement step resumes and starts
  the continuation segment after the original expression statement.
- `examples/async_await_expression_statement.ts` covers declarations, arrows,
  methods, anonymous async function expressions, `Promise<void>`, multiple
  awaited expression statements, ordering, and `.then` observers.
- `examples/await_expression_statement_deferred_fail.ts` now pins
  `foo(await Promise.resolve(...))` as a still-deferred call-expression
  statement case.

## Consequences

- **Accepted**: top-level `await Promise<T>;` statements now work in the
  existing async frame surfaces, and the fulfilled payload is intentionally
  discarded.
- **Preserved**: top-level await bindings, initializer awaits, call-argument
  await in declaration initializers / terminal returns, and terminal return
  await continue to share the same ordered frame model.
- **Regression**: `tests/smoke.sh` adds
  `async_await_expression_statement` and keeps
  `await_expression_statement_deferred_fail`; the smoke suite now has 440
  explicit run entries.
- **Scope outside**: `foo(await p);`, `x = await p;`, non-terminal
  `return await p;`, nested / multiple awaits in one expression, control-flow
  or try/catch/finally await, ordinary local capture across later awaits,
  Promise rejection handlers, PromiseLike / thenable assimilation, and
  top-level module await remain deferred.
