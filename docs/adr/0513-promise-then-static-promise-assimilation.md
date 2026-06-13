# 0513 - promise then static promise assimilation

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.46

## Context

ADR [0510](./0510-promise-catch-rejection-continuations.md), ADR
[0511](./0511-promise-then-rejection-continuations.md), and ADR
[0512](./0512-promise-finally-cleanup-continuations.md) completed the current
Promise method continuation surface, but callback returns of `Promise<U>`
still rejected as thenable assimilation. That blocked common static Promise
chains even when the returned value is a Topaz-owned `Promise<U>`.

## Decision

Accept static Promise assimilation only for one-handler
`Promise<T>.then(onFulfilled)` callbacks whose return type is exactly
`Promise<U>`. The chained call result is `Promise<U>`, and the generated
runner forwards the returned Promise's eventual fulfilled or rejected
settlement into the already-created target Promise. Rejected alternatives:
arbitrary thenable / `PromiseLike` probing, two-handler branch Promise-return
joins, `.catch` Promise-return recovery, `.finally` cleanup wait semantics,
optional handler normalization, and synchronous unwrapping all remain out of
scope.

## Implementation

- `runtime/runtime.h:165` adds a settled-Promise forwarding runner that copies
  fulfilled payload bytes or forwards rejected class-instance payloads.
- `runtime/runtime.h:319` adds `topaz_promise_forward_into`, implemented as a
  settled continuation so already-settled returned Promises still forward via
  the FIFO microtask queue.
- `src/codegen.ts:11776` allows Promise-return callbacks only when
  `inferPromiseThenCall` is handling one-argument `.then`.
- `src/codegen.ts:11820` infers one-handler Promise-return callbacks as the
  returned `Promise<U>` instead of wrapping them as `Promise<Promise<U>>`.
- `src/codegen.ts:11924` emits Promise-return `.then` runners that call the
  callback under the existing exception frame, forward normal returned
  Promises, and reject the target if the callback throws before returning.
- `scripts/check-runtime-substrate.mjs:310` classifies the forwarding helpers
  as Promise continuation substrate.
- `src/runtime_header.ts` was regenerated from `runtime/runtime.h`.

## Consequences

- **Accepted**: `promise_then_return_promise` covers fulfilled returned
  Promise, returned rejected Promise recovered by `.catch`, pending nested
  Promise FIFO ordering, and callback throw override.
- **Rejected**: `promise_then_two_handler_return_promise_fail`,
  `promise_then_on_rejected_return_promise_fail`,
  `promise_catch_return_promise_fail`, and
  `promise_finally_return_promise_fail` keep deferred surfaces explicit.
- **Regression**: smoke now covers 481 explicit run entries, including the new
  positive and two-handler fulfilled-branch fail case. The positive TypeScript
  syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_then_return_promise.ts`.
- **Scope out**: no arbitrary thenable assimilation, two-handler branch join,
  `.catch` Promise-return recovery, `.finally` cleanup wait semantics,
  optional handler normalization, unhandled rejection reporting, public
  scheduler API, or async frame rejection resumption is implemented here.
