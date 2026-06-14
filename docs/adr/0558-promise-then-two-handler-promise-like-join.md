# 0558 - promise then two-handler PromiseLike join

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.91

## Context

ADR [0518](./0518-promise-then-mixed-branch-static-assimilation.md) joined
callable two-handler `.then` branches by normalized payload for value and
native `Promise<U>` callback results. ADR
[0550](./0550-promise-like-native-adapter.md) introduced native
`PromiseLike<T>` descriptors and `topaz_promise_like_to_promise(...)`, and ADRs
[0553](./0553-promise-then-promise-like-return.md) through
[0557](./0557-promise-finally-promise-like-cleanup.md) opened the simpler
callback positions while leaving the callable two-handler branch join deferred.

## Decision

Extend only callable two-handler `Promise<T>.then(onFulfilled, onRejected)` so
callback returns normalize by payload before joining: value / `void` results
use `promiseOf(result).value`, static native `Promise<U>` returns normalize to
`U`, and static native `PromiseLike<U>` returns normalize to `U`. The chained
call result is `Promise<U>`, and lowering continues to use the existing
fulfilled and rejected branch runners, including `topaz_promise_like_to_promise(...)`
followed by `topaz_promise_forward_into(...)` for selected PromiseLike
branches. Rejected alternatives: a both-PromiseLike-only rule would be narrower
than the accepted normalized join; global `PromiseLike` aliasing would erase
the descriptor boundary; teaching `promiseOf` about PromiseLike would leak this
bridge into storage/value sites; and structural `.then` probing remains a
separate thenable assimilation decision.

## Implementation

- `src/codegen.ts:12872` adds `PromiseLike<U>` to the local
  `.then` result normalizer without changing `promiseOf(...)`.
- `src/codegen.ts:12957` allows `PromiseLike<U>` return types only in the
  callable two-handler branch already guarded by `.then` arity and sentinel
  checks.
- `src/codegen.ts:12975` keeps mismatched branches involving PromiseLike in
  normalized-payload diagnostics.
- `src/codegen.ts:13113` and `src/codegen.ts:13163` already lower selected
  PromiseLike fulfilled / rejected runners by converting descriptors and
  forwarding settlement into the shared target.
- `MEMO.md:484` records the phase boundary without reopening scheduler,
  structural thenable, async-return, or result-union work.

## Consequences

- **Accepted**: callable two-handler `.then` callback pairs whose value,
  `Promise<U>`, and `PromiseLike<U>` returns normalize to the same payload now
  infer `Promise<U>`.
- **Rejected**: mismatched normalized payloads with PromiseLike still fail in
  payload terms.
- **Regression**: `promise_then_two_handler_return_promise_like` is the
  positive compatibility matrix, and
  `promise_then_two_handler_return_promise_like_mismatch_fail` pins the
  PromiseLike mismatch diagnostic. Smoke covers 606 explicit `run_case` /
  `run_module_case` / `run_fail_case` entries.
- **Scope out**: structural thenable probing, `Promise.resolve(Promise<T>)`
  flattening, async `PromiseLike<T>` returns, result-union joins, arbitrary
  non-function handler normalization, `.catch` / sentinel `.then` /
  `.finally` changes, for-await, scheduler changes, and unhandled rejection
  reporting remain deferred.
