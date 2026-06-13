# 0470 - promise then fulfillment continuations

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.3

## Context

ADR [0469](./0469-promise-resolve-reject-value-surface.md) gave Topaz-owned
Promise values fulfilled/rejected payload storage but still made every
observable Promise method a deferred scheduler surface. The next async/await
compatibility slice needs a real continuation boundary before async function
or `await` lowering can be attached without faking synchronous Promise
callbacks.

## Decision

Accept only `Promise<T>.then(onFulfilled)` as a fulfillment-only continuation
surface. The callback is scheduled through a Topaz-owned single-thread FIFO
microtask queue, never invoked synchronously even when the source Promise is
already fulfilled, and generated `main()` drains that queue before returning.
The chained result is `Promise<U>` where `U` is the callback return type and
the existing value-representable Promise payload frontier can form
`Promise<U>`, including `void`. A rejected source Promise propagates the same
class-instance rejection payload to the chained Promise because no rejection
handler surface exists yet. Rejected alternatives: two-argument `.then`,
`.catch`, `.finally`, synchronous callback invocation, `PromiseLike` /
thenable assimilation, and user-callable scheduler APIs remain out of scope.

## Implementation

- `runtime/runtime.h:89` expands `topaz_promise` with a pending state,
  continuation lists, a FIFO microtask queue, fulfillment/rejection settlement
  helpers, payload reads, `topaz_promise_then`, and
  `topaz_promise_drain_microtasks`.
- `src/codegen.ts:2708` drains queued Promise microtasks at the end of
  generated `main()`.
- `src/codegen.ts:9359` validates `.then` as a one-argument callback-only
  method, infers the callback signature from `Promise<T>`, rejects
  Promise-returning callbacks until explicit thenable assimilation is designed,
  and returns `Promise<U>`.
- `src/codegen.ts:9408` emits one typed continuation trampoline per
  payload/result shape. The trampoline reads the fulfilled payload, calls the
  callback, fulfills the chained Promise, and converts callback throws into
  rejection of the chained Promise.
- `src/codegen.ts:9450` lowers `.then` calls to allocate a callback context and
  call `topaz_promise_then`; `src/codegen.ts:9564` and `src/codegen.ts:12466`
  route Promise method emission/inference through that narrow path while
  leaving other Promise instance methods deferred.
- `scripts/check-runtime-substrate.mjs:41` / `scripts/check-runtime-substrate.mjs:56`
  classify the Promise value and continuation helpers separately, and
  `tests/smoke.sh:1000` / `tests/smoke.sh:1037` keep the detailed substrate
  inventory pinned.

## Consequences

- **Accepted**: `promise_then_fulfilled` demonstrates TS-compatible
  fulfillment ordering, typed callback payloads, typed chained
  `Promise<number>`, and `Promise<void>` callback results.
- **Rejected**: two-argument `.then`, non-function `.then` callbacks, `.catch`,
  `.finally`, Promise-returning `.then` callbacks / thenable assimilation,
  async functions, `await`, for-await, timers, I/O event-loop integration,
  top-level await, async arrows, async methods, and parallel scheduling.
- **Regression**: smoke now covers 416 explicit run entries, including the
  positive `promise_then_fulfilled` sample and fail samples
  `promise_resolve_deferred_fail`,
  `promise_then_on_rejected_deferred_fail`, `promise_then_non_fn_fail`,
  `promise_catch_deferred_fail`, and `promise_finally_deferred_fail`. The
  positive TypeScript syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_then_fulfilled.ts`.
- **Scope out**: no async frame ABI, `await` lowering, rejection handler
  callback, unhandled rejection reporting, Promise combinator, public scheduler
  API, `PromiseLike` bridge, static thenable assimilation, or Topaz-owned
  parallel scheduler semantics is implemented here.
