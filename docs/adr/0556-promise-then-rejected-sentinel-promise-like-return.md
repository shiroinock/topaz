# 0556 - promise then rejected sentinel PromiseLike return bridge

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.89

## Context

ADR [0541](./0541-promise-handler-sentinel-normalization.md) normalized
`undefined` / `null` Promise handler sentinels. ADR
[0554](./0554-promise-catch-promise-like-return.md) accepted static native
`PromiseLike<T>` returns for `.catch(onRejected)`, and ADR
[0555](./0555-promise-then-sentinel-promise-like-return.md) opened the
fulfilled-only sentinel spelling. The remaining catch-like spelling,
`Promise<T>.then(undefined/null, onRejected)`, has the same rejected runner
shape as `.catch(...)` and does not require the real two-handler branch join
matrix.

## Decision

Accept static native `PromiseLike<T>` callback returns only for
`Promise<T>.then(undefined/null, onRejected)` when `T` exactly matches the
source Promise payload. The chained result remains `Promise<T>`, and lowering
continues to reuse the ADR 0554 rejected runner that converts the
`topaz_promise_like *` descriptor with `topaz_promise_like_to_promise(...)`
before forwarding settlement with `topaz_promise_forward_into(...)`.

Rejected alternatives: allowing callable two-handler `.then` PromiseLike
branches would need a full branch join policy; making the shared Promise.then
result checker accept PromiseLike globally would silently open deferred
surfaces; structural thenable probing would cross the native descriptor
boundary; and `.finally`, async `PromiseLike<T>` returns, and
`Promise.resolve(Promise<T>)` flattening remain separate decisions.

## Implementation

- `src/codegen.ts:12905` allows `PromiseLike<T>` only inside the
  `fulfilledIsSentinel && !rejectedIsSentinel` inference branch.
- `src/codegen.ts:12906` normalizes a rejected callback's
  `PromiseLike<T>` result to payload `T` before checking it against the source
  Promise payload.
- `src/codegen.ts:13280` already routes this sentinel spelling through
  `recordPromiseCatchRunner(...)`, so the ADR 0554 `topaz_promise_like *`
  forwarding branch is reused without a new runner family.
- `examples/promise_then_rejected_sentinel_return_promise_like.ts:1` covers
  `undefined` and `null` sentinels, fulfilled-source bypass, returned rejected
  native Promise forwarding, callback throw precedence, and FIFO ordering.
- `examples/promise_then_rejected_sentinel_return_promise_like_fail.ts:1`
  pins the mismatched `PromiseLike<U>` boundary.

## Consequences

- **Accepted**: explicit absent fulfillment-handler spellings can use
  `PromiseLike<T>` rejected callbacks and still produce a Topaz-owned
  `Promise<T>`.
- **Rejected**: callable two-handler PromiseLike joins, fulfilled-sentinel
  changes beyond ADR 0555, `.catch` and `.finally` changes, structural
  thenables, `Promise.resolve(Promise<T>)` flattening, async
  `PromiseLike<T>` return annotations, for-await, scheduler changes, and
  unhandled rejection reporting remain out of scope.
- **Regression**:
  `promise_then_rejected_sentinel_return_promise_like` and
  `promise_then_rejected_sentinel_return_promise_like_fail`; smoke covers 607
  explicit `run_case` / `run_module_case` / `run_fail_case` entries.
