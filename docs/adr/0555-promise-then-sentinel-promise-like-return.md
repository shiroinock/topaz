# 0555 - promise then sentinel PromiseLike return bridge

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.88

## Context

ADR [0541](./0541-promise-handler-sentinel-normalization.md) normalized
syntactic `undefined` / `null` Promise handler sentinels, including
`Promise<T>.then(onFulfilled, undefined/null)` as the fulfilled-only spelling.
ADR [0553](./0553-promise-then-promise-like-return.md) accepted static native
`PromiseLike<U>` returns for one-handler `.then(onFulfilled)`. The
two-argument sentinel spelling has the same fulfilled continuation shape, but
the previous guard still rejected the callback's `PromiseLike<U>` return.

## Decision

Accept static native `PromiseLike<U>` returns only for
`Promise<T>.then(onFulfilled, undefined/null)`. The call result is inferred as
`Promise<U>`, and the existing fulfilled runner receives the
`topaz_promise_like *`, converts it with
`topaz_promise_like_to_promise(...)`, and forwards settlement with
`topaz_promise_forward_into(...)`.

Rejected alternatives: widening `checkPromiseThenResultType` for all Promise
callback positions would open callable two-handler joins and rejected-handler
branches together; using structural thenable probing would cross the native
descriptor boundary from ADR 0550; changing `.catch` or `.finally` would exceed
the sentinel `.then` surface; and flattening `Promise.resolve(Promise<T>)`
remains a separate semantics decision.

## Implementation

- `src/codegen.ts:12929` allows `PromiseLike<U>` only in the
  `rejectedIsSentinel` fulfilled branch.
- `src/codegen.ts:12930` normalizes that descriptor result to `Promise<U>` for
  the chained call type while preserving value, void, and static `Promise<U>`
  returns.
- `src/codegen.ts:13105` continues to reuse the ADR 0553 fulfilled runner
  branch that converts a `topaz_promise_like *` and forwards settlement.
- `examples/promise_then_sentinel_return_promise_like.ts:1` covers
  `undefined` and `null` sentinels, rejected-source pass-through recovery,
  returned rejected native PromiseLike recovery, and callback throw precedence.
- `tests/smoke.sh:3088` replaces the obsolete sentinel fail row with the new
  positive regression while keeping the existing deferred-boundary fails.

## Consequences

- **Accepted**: explicit absent rejection-handler spellings can use
  `PromiseLike<U>` fulfilled callbacks and still produce Topaz-owned
  `Promise<U>` values.
- **Rejected**: callable two-handler `.then` `PromiseLike` joins,
  `.then(sentinel, onRejected)` PromiseLike returns, `.catch`, `.finally`,
  structural thenables, `Promise.resolve(Promise<T>)` flattening, async
  `PromiseLike<T>` return annotations, for-await, scheduler changes, and
  unhandled rejection reporting remain out of scope.
- **Regression**: `promise_then_sentinel_return_promise_like` plus the existing
  deferred-boundary fail cases; smoke covers 604 explicit `run_case` /
  `run_module_case` / `run_fail_case` entries.
