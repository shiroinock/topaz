# 0480 - async function expression await-frame lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.13

## Context

Async declarations, async arrows, and async methods already share the generated
await-frame machinery from ADRs [0473](./0473-async-frame-await-lowering.md),
[0475](./0475-async-arrow-await-frame-lowering.md), and
[0477](./0477-async-method-await-frame-lowering.md). ADR
[0479](./0479-no-await-async-function-expression-lowering.md) accepted
anonymous no-await async function expressions as ordinary fn values, but kept
function-expression awaits deferred so this follow-up could explicitly confirm
the frame and closure ABI boundary.

## Decision

Reuse the async arrow await-frame path for anonymous block-bodied
`async function (...) { ... }` expressions whose awaits are top-level
`const` / `let` bindings. The `function_expr` AST node still adapts to the
existing block-bodied arrow representation, so params, the output Promise, and
the existing capture env pointer are stored in the generated frame without an
async-specific callable ABI. Rejected alternatives: adding a separate async
function-expression ABI would duplicate fn fat pointers, named
self-recursive function expressions need a new binding model, and accepting
`return await`, arbitrary await placement, try/finally await, thenable
assimilation, or scheduler modes would expand past this phase's supported
await-frame frontier.

## Implementation

- `src/codegen.ts:5059` keeps named function expressions rejected before any
  frame analysis and preserves the function-expression `this` diagnostic.
- `src/codegen.ts:5068` and `src/codegen.ts:5073` continue routing
  function-expression typing and emission through the existing arrow fn value
  path, which now lets async function expressions with supported await bindings
  reach `emitAsyncArrowBodyText`.
- `src/codegen.ts:5859` detects the supported await-frame shape in the adapted
  block body and passes the current capture context to
  `emitAsyncFunctionBodyWithAwaitFrame`, reusing the async arrow capture restore
  machinery.
- `MEMO.md:394` records the completed 5.13 roadmap slice and leaves
  arbitrary/return await, PromiseLike / thenable assimilation, and scheduler mode
  for later phases.

## Consequences

- **Accepted**: `examples/async_function_expression_await.ts` covers assignment
  of an anonymous async function expression to a fn type, two top-level await
  bindings, parameter use after suspension, captured-value use after
  suspension, and FIFO `.then` ordering.
- **Rejected**: `examples/function_expression_async_deferred_fail.ts` continues
  to use `return await Promise.resolve(1)` and now preserves the shared
  arbitrary-await diagnostic.
- **Preserved**: named function expressions and function-expression `this` are
  still rejected before lowering, and no async-specific fn ABI is introduced.
- **Regression**: smoke has the new positive `async_function_expression_await`
  case, and the positive sample is also checked with `pnpm exec tsc --noEmit
  --skipLibCheck examples/async_function_expression_await.ts`.
- **Scope out**: named self-binding recursion, generic/generator/rest/default/
  optional/destructured params, `arguments`, `new.target`, return/arbitrary
  await, await inside try/catch/finally, ordinary local capture across later
  awaits, PromiseLike / thenable assimilation, rejection handlers, and scheduler
  modes remain future work.
