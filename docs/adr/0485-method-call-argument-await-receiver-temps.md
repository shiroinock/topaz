# 0485 - method call-argument await receiver temps

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.18

## Context

ADR [0484](./0484-bare-call-argument-await-decomposition.md) accepted a direct
`await` in bare function-call arguments by storing left-of-await argument temps
before suspension. Class and interface method calls add one more left-to-right
value: `receiver.method(a, await p, c)` must evaluate the receiver before
`a`, and both before scheduling the awaited Promise.

## Decision

Accept exactly one direct `await` argument in a non-optional class or interface
method call when the call is the initializer of a top-level `const` / `let`
inside an already-supported block-bodied async function, async arrow, async
method, or anonymous async function expression. The async frame stores an
optional receiver temp before pre-await argument temps, then resumes by
restoring receiver, pre-await args, and the awaited payload before ordinary
method dispatch. Rejected alternatives: evaluating the receiver after
resumption would move receiver side effects across suspension; broadening this
to Array / Map / Set / String / Number / Promise / synthetic builtin calls
would cross specialized emitter and ABI surfaces that need a separate scout.

## Implementation

- `src/codegen.ts:152` adds receiver-temp metadata alongside call-argument
  pre-await temps.
- `src/codegen.ts:4515` threads the optional receiver temp through initializer
  suspension discovery before the transformed initializer is inferred.
- `src/codegen.ts:4693` extends call-argument await decomposition from bare
  identifier calls to class / interface property callees, rejects optional or
  non-class/interface receivers, declares the receiver temp before argument
  temps, and rewrites the transformed callee receiver to that temp.
- `src/codegen.ts:5020` stores receiver temps into the async frame before
  pre-await arguments and before scheduling `topaz_promise_then_into`.
- `src/codegen.ts:5067` adds receiver temps to the frame struct, and
  `src/codegen.ts:5241` restores them before resumed method-call emission.
- `MEMO.md:399` records phase 5.18 while keeping broader call surfaces
  deferred.

## Consequences

- **Accepted**: `examples/async_await_method_call_arg_initializer.ts` covers
  async function declarations, async arrows, async methods, anonymous async
  function expressions, concrete class method calls, interface method dispatch,
  receiver and pre-argument side effects before `sync tail`, post-argument
  side effects after resumption, and later reads of the initialized binding.
- **Preserved**: bare function call-argument await, simple initializer await,
  terminal return await, and the existing `topaz_promise_then_into` scheduler
  ABI continue unchanged.
- **Rejected**:
  `examples/await_call_arg_builtin_deferred_fail.ts` pins synthetic builtin
  call-argument await, `examples/await_call_arg_method_deferred_fail.ts` now
  pins Array method call-argument await, and
  `examples/await_return_expr_deferred_fail.ts` keeps return-expression
  call-argument await deferred.
- **Regression**: `tests/smoke.sh:2950` adds the positive method-call case and
  `tests/smoke.sh:2957` adds the new builtin fail case; the smoke suite now
  has 436 explicit run entries. The positive sample is also checked with
  `pnpm exec tsc --noEmit --skipLibCheck
  examples/async_await_method_call_arg_initializer.ts`.
- **Scope out**: collection / scalar / Promise / synthetic builtin method
  calls, optional calls, element access callees, constructor calls, nested or
  multiple awaits, return-expression method call-argument await, arbitrary
  expression decomposition, general local capture, PromiseLike / thenable
  assimilation, rejection handlers, and scheduler modes remain future work.
