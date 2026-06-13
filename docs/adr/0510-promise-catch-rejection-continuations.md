# 0510 - promise catch rejection continuations

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.43

## Context

ADR [0469](./0469-promise-resolve-reject-value-surface.md) made Topaz-owned
Promise values store fulfilled payload copies and rejected class-instance
payloads. ADR [0470](./0470-promise-then-fulfillment-continuations.md) added
the FIFO microtask queue and fulfillment-only `.then(onFulfilled)` runners, but
there was still no accepted rejection handler surface for async/await
compatibility.

## Decision

Accept only one-argument `Promise<T>.catch(onRejected)` as the first rejection
continuation surface. The handler parameter is exactly `unknown`, matching
normal `catch (e)` narrowing, because rejection payloads are type-erased at the
runtime boundary. The handler return type must be exactly `T` for `Promise<T>`
or `void` for `Promise<void>`, and the chained result is `Promise<T>`.
Fulfilled sources bypass the handler and propagate the original fulfilled
payload; rejected sources enqueue the handler on the same FIFO queue as
`.then`. Rejected alternatives: two-argument `.then`, `.finally`, callback
result joins, Promise-returning handler thenable assimilation, unhandled
rejection reporting, and public scheduler APIs remain out of scope.

## Implementation

- `runtime/runtime.h:98` tags Promise continuations as fulfillment or
  rejection handlers.
- `runtime/runtime.h:159` and `runtime/runtime.h:163` propagate fulfilled
  payloads through bypassed rejection handlers and enqueue rejected `.catch`
  handlers instead of synchronously invoking them.
- `runtime/runtime.h:232` centralizes continuation registration, while
  `runtime/runtime.h:293` exposes `topaz_promise_catch`.
- `src/codegen.ts:11764` validates catch callbacks as `(unknown) => T`.
- `src/codegen.ts:11794` enforces one argument, exact return type, and the
  existing thenable-assimilation deferral for Promise-returning handlers.
- `src/codegen.ts:11877` emits typed rejection trampolines that pass
  `source->rejected_error` as `unknown`, fulfill the chained Promise on normal
  return, and reject it when the handler throws.
- `src/codegen.ts:11946`, `src/codegen.ts:13085`, and `src/codegen.ts:15513`
  lower and infer `.catch` while leaving other Promise methods deferred.
- `scripts/check-runtime-substrate.mjs:306` keeps the added Promise
  continuation helpers visible in the runtime substrate inventory.

## Consequences

- **Accepted**: `promise_catch_rejected` covers numeric/string recovery,
  fulfilled-source bypass, `Promise<void>` handlers, `unknown` narrowing,
  handler throw recovery through a second `.catch`, and FIFO ordering relative
  to fulfillment `.then`.
- **Rejected**: class-typed catch handler parameters, catch return mismatches,
  Promise-returning catch handlers, two-argument `.then`, and `.finally` remain
  smoke-pinned.
- **Regression**: smoke now covers 471 explicit run entries, including
  `promise_catch_rejected`,
  `promise_catch_deferred_fail`,
  `promise_catch_return_mismatch_fail`,
  `promise_catch_return_promise_fail`, and
  `promise_catch_wrong_arity_fail`. The positive TypeScript syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_catch_rejected.ts`.
- **Scope out**: no rejection type inference, result-type union/join policy,
  `.then(onFulfilled, onRejected)`, `.finally`, thenable assimilation,
  unhandled rejection reporting, public scheduler API, or async frame rejection
  resumption is implemented here.
