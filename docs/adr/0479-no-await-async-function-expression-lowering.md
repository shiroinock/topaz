# 0479 - no-await async function expression lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.12

## Context

ADRs [0474](./0474-no-await-async-arrow-lowering.md) through
[0477](./0477-async-method-await-frame-lowering.md) established Promise
wrapping and await-frame lowering for arrows and methods, and
[0478](./0478-anonymous-function-expression-frontier.md) added the
`function_expr` AST plus synchronous anonymous function-expression lowering.
The remaining compatibility gap for this slice was anonymous
`async function (...) { ... }` expressions that do not suspend.

## Decision

Lower anonymous no-await async function expressions as ordinary fn values whose
return type is `Promise<T>`. The body is type-checked against payload `T`, then
the existing async arrow no-await path wraps `return T`, void fallthrough, and
escaping class-instance throws into fulfilled or rejected Topaz Promises while
preserving the function-expression closure env snapshot ABI. Rejected
alternatives: adding an async-specific callable ABI would duplicate the fn fat
pointer shape, enabling await frames now would hide the next design step, and
supporting named self-binding recursion or dynamic function-expression `this`
would expand beyond this phase's compatibility slice.

## Implementation

- `src/codegen.ts:5048` preserves the `function_expr` async flag when adapting
  to the existing block-bodied arrow lowering path.
- `src/codegen.ts:5059` keeps named function expressions rejected first, keeps
  function-expression `this` deferred, and rejects async function-expression
  bodies containing `await` with the phase-specific frame-lowering diagnostic.
- `src/codegen.ts:5074` and `src/codegen.ts:5079` continue to route
  contextual typing and emission through the existing arrow fn value path, so
  no async-specific fn ABI or closure machinery is added.
- `MEMO.md:393` records the completed 5.12 roadmap slice and leaves await
  frames, arbitrary/return await, thenable assimilation, and scheduler mode for
  later phases.

## Consequences

- **Accepted**: `examples/async_function_expression_no_await.ts` covers
  assignment to a `() => Promise<number>` type, capture of an outer binding,
  contextual callback passing, and FIFO `.then` ordering after synchronous
  invocation.
- **Rejected**: `examples/function_expression_async_deferred_fail.ts` now
  targets `return await Promise.resolve(1)` and preserves the next boundary
  with `async function expression with await is deferred until async function
  expression frame lowering`.
- **Rejected**: `examples/function_expression_named_deferred_fail.ts` keeps the
  named-expression precedence with `named function expressions are deferred`.
- **Regression**: smoke has 419 `run_*` cases after adding the positive sample
  and retargeting the async fail sample. The positive sample is also checked
  with `pnpm exec tsc --noEmit --skipLibCheck
  examples/async_function_expression_no_await.ts`.
- **Scope out**: named function expressions, async function-expression await
  frames, generic/generator/rest/default/optional/destructured parameters,
  `arguments`, `new.target`, function-expression `this`, arbitrary/return
  await, PromiseLike / thenable assimilation, and scheduler modes remain future
  work.
