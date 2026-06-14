# 0553 - promise then PromiseLike return bridge

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.86

## Context

ADR [0513](./0513-promise-then-static-promise-assimilation.md) allowed
one-handler `Promise<T>.then(onFulfilled)` callbacks to return static native
`Promise<U>` values and forward their settlement through the existing FIFO
Promise continuation path. ADR [0550](./0550-promise-like-native-adapter.md)
introduced native `PromiseLike<T>` descriptors plus
`topaz_promise_like_to_promise(...)`, and ADRs
[0551](./0551-promise-like-await-bridge.md) and
[0552](./0552-promise-like-resolve-bridge.md) used that helper for supported
`await` and `Promise.resolve(...)` bridge positions. TypeScript's `.then`
surface also accepts callback returns of `U | PromiseLike<U>`, so the adjacent
static bridge is a callback annotated as `PromiseLike<U>`.

## Decision

Accept static native `PromiseLike<U>` returns only for one-argument
`Promise<T>.then(onFulfilled)`. The chained call result is inferred as
`Promise<U>`, and the fulfilled runner calls the callback under the existing
try frame, converts the descriptor with `topaz_promise_like_to_promise(...)`,
then forwards the normalized Promise settlement into the target with
`topaz_promise_forward_into(...)`.

Rejected alternatives: structural thenable probing would cross the native
descriptor boundary from ADR 0550; teaching generic Promise method callback
normalization about `PromiseLike<T>` would also widen two-handler `.then`,
`.catch`, and `.finally` positions; treating `PromiseLike<T>` as an alias for
`Promise<T>` would erase the bridge boundary; flattening
`Promise.resolve(Promise<T>)` remains a separate semantics decision.

## Implementation

- `src/codegen.ts:12841` threads an explicit `allowPromiseLikeReturn` decision
  through `.then` result checking and keeps two-handler / sentinel positions on
  the deferred diagnostic.
- `src/codegen.ts:12940` infers one-handler `PromiseLike<U>` callback returns
  as chained `Promise<U>` without changing ordinary value, void, or
  `Promise<U>` result inference.
- `src/codegen.ts:13056` adds a `PromiseLike` branch to the fulfilled runner
  that receives the descriptor, normalizes it, and forwards settlement through
  the same path used by static `Promise<U>` returns.
- `examples/promise_then_return_promise_like.ts:1` covers fulfilled
  descriptor return, native Promise through expected `PromiseLike<T>`, returned
  rejection recovery, and callback throw precedence.
- `examples/promise_then_sentinel_return_promise_like_fail.ts:1` and
  `examples/promise_then_two_handler_return_promise_like_fail.ts:1` pin the
  sentinel and two-handler boundaries.

## Consequences

- **Accepted**: one-handler `.then` callbacks annotated as `PromiseLike<U>` can
  return native Topaz Promises through the descriptor adapter and produce a
  Topaz-owned `Promise<U>`.
- **Rejected**: two-handler `.then`, sentinel handler forms, `.catch`,
  `.finally`, structural thenables, `Promise.resolve(Promise<T>)` flattening,
  async `PromiseLike<T>` return annotations, for-await, scheduler changes, and
  unhandled rejection reporting remain out of scope.
- **Regression**: `promise_then_return_promise_like`,
  `promise_then_sentinel_return_promise_like_fail`, and
  `promise_then_two_handler_return_promise_like_fail`; smoke now covers 600
  explicit `run_case` / `run_module_case` / `run_fail_case` entries, plus the
  existing static ADR/MEMO contract.
