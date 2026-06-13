# 0484 - bare call-argument await decomposition

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.17

## Context

ADR [0482](./0482-terminal-return-expression-await-lowering.md) introduced
ordered async suspension steps for terminal return expression await, and ADR
[0483](./0483-initializer-expression-await-lowering.md) reused that model for
top-level declaration initializers. The next compatibility gap is a call
initializer such as `const value = f(a, await p, c)`, where replacing the
`await` with a temp after resumption would incorrectly move evaluation of
pre-await arguments after the suspension.

## Decision

Accept exactly one direct `await` argument in a non-optional bare identifier
function call when that call is the initializer of a top-level `const` / `let`
inside an already-supported block-bodied async function, async arrow, async
method, or anonymous async function expression. Arguments to the left of the
await are evaluated before scheduling `topaz_promise_then_into` and saved in
async-frame temps; after fulfillment, the runner restores those temps, restores
the awaited payload temp, evaluates post-await arguments, emits the transformed
call, and stores the declared binding in the frame. Rejected alternatives:
loosening simple await replacement for all calls would break left-to-right
evaluation, and accepting method / builtin / Promise calls or general expression
decomposition would cross receiver, synthetic namespace, and local-capture
boundaries that need separate design.

## Implementation

- `src/codegen.ts:146` adds call-argument pre-await temp metadata to
  initializer suspension steps.
- `src/codegen.ts:4490` routes non-simple declaration initializer awaits
  through the call-argument decomposition helper before falling back to the
  shared deferred diagnostic.
- `src/codegen.ts:4684` recognizes only bare identifier calls with one direct
  awaited argument, builds a signature-checking call with the awaited payload
  temp, declares pre-await argument temps, and returns the transformed call.
- `src/codegen.ts:4906` stores pre-await argument temps before scheduling the
  first awaited Promise.
- `src/codegen.ts:4972` adds pre-await temps to the async frame, and
  `src/codegen.ts:5142` restores them before emitting the resumed initializer.
- `src/codegen.ts:5172` performs the same pre-await temp stores before
  scheduling later suspension steps.
- `MEMO.md:398` records phase 5.17 and keeps broader await decomposition
  deferred.

## Consequences

- **Accepted**: `examples/async_await_call_arg_initializer.ts` covers async
  function declarations, async arrows, async methods, anonymous async function
  expressions, left-of-await side effects before `sync tail`, right-of-await
  side effects after resumption, and later reads of the declared binding.
- **Preserved**: direct await bindings, initializer simple-expression await,
  terminal return await, terminal return expression await, and the existing
  `topaz_promise_then_into` scheduler ABI continue unchanged.
- **Rejected**:
  `examples/await_call_arg_multiple_deferred_fail.ts` pins multiple awaits in
  one call argument list,
  `examples/await_call_arg_method_deferred_fail.ts` pins method/property
  callees, and `examples/await_return_expr_deferred_fail.ts` now pins
  return-expression call-argument await.
- **Regression**: `tests/smoke.sh:2949` adds the positive call-argument
  initializer case plus adjacent fail cases; the smoke suite now has 434
  explicit run entries. The positive sample is also checked with
  `pnpm exec tsc --noEmit --skipLibCheck
  examples/async_await_call_arg_initializer.ts`.
- **Scope out**: method / property / element / IIFE / synthetic builtin /
  Promise calls, constructor calls, optional calls, call-argument spread,
  multiple awaits, nested awaited arguments, return-expression call-argument
  await, arbitrary expression decomposition, ordinary local capture,
  PromiseLike / thenable assimilation, rejection handlers, and scheduler modes
  remain future work.
