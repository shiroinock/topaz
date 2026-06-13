# 0486 - terminal return call-argument await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.19

## Context

ADR [0484](./0484-bare-call-argument-await-decomposition.md) and ADR
[0485](./0485-method-call-argument-await-receiver-temps.md) accepted direct
call-argument `await` for declaration initializers. ADR
[0482](./0482-terminal-return-expression-await-lowering.md) already made final
return-expression awaits into ordered suspension steps, but
`return f(a, await p, c);` still stopped at the deferred frontier.

## Decision

Accept exactly one direct `await` argument in a non-optional bare function call
or class / interface method call when that call is the expression of the final
top-level `return` in an already-supported block-bodied async function, async
arrow, async method, or anonymous async function expression. Return steps reuse
the declaration-initializer call decomposition so receiver temps and
left-of-await argument temps are stored before scheduling the awaited Promise,
then restored before the resumed return call is emitted. Rejected alternatives:
lowering return calls as declaration initializer temps would add an artificial
local across suspension; broadening this to builtin / collection / scalar /
Promise / synthetic method surfaces would cross specialized emitters and should
be scouted as their own frontier.

## Implementation

- `src/codegen.ts:133` lets return suspension steps carry optional receiver and
  pre-await argument temps.
- `src/codegen.ts:4591` routes non-simple terminal return-expression awaits
  through the shared call-argument decomposition helper.
- `src/codegen.ts:4704` reuses the same call root, callee, receiver, spread,
  direct-await-argument, and param-resolution checks for initializer and return
  lowering.
- `src/codegen.ts:5034` stores return-step receiver and pre-argument temps into
  the async frame before `topaz_promise_then_into`.
- `src/codegen.ts:5104` includes return-step temps in the frame struct, and
  `src/codegen.ts:5246` restores them before emitting the transformed return
  expression.
- `MEMO.md:400` records phase 5.19 and keeps broader call surfaces deferred.

## Consequences

- **Accepted**: `examples/async_return_call_arg_await.ts` covers async function
  declarations, async arrows, async methods, anonymous async function
  expressions, bare calls, class method calls, interface method calls,
  receiver / pre-await side effects before `sync tail`, post-await side effects
  after resumption, and `.then` observers seeing returned values.
- **Preserved**: terminal simple return-expression await, terminal
  `return await`, and declaration-initializer bare / method call-argument await
  keep the same frame and scheduler behavior.
- **Rejected**: `examples/await_return_expr_deferred_fail.ts` now pins scalar
  method call-argument await in a return expression so specialized builtin
  emitters stay outside this phase. Existing declaration-initializer fail cases
  for multiple awaits, builtin calls, and collection methods remain unchanged;
  legacy async function / method / function-expression deferred samples now pin
  non-terminal expression-statement await instead of the newly accepted
  terminal return-call shape.
- **Regression**: `tests/smoke.sh:2951` adds the positive return-call case and
  keeps the existing deferred return-expression fail row; the smoke suite now
  has 437 explicit run entries. The positive sample is also checked with
  `pnpm exec tsc --noEmit --skipLibCheck
  examples/async_return_call_arg_await.ts`.
- **Scope out**: builtin / collection / scalar / Promise / synthetic method
  calls, optional calls, element access callees, constructor calls, nested or
  multiple awaits, non-terminal returns, arbitrary expression decomposition,
  general local capture, PromiseLike / thenable assimilation, rejection
  handlers, and scheduler modes remain future work.
