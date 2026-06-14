# 0554 - promise catch PromiseLike return bridge

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.87

## Context

ADR [0514](./0514-promise-catch-static-promise-assimilation.md) opened
`.catch` callback returns of static `Promise<T>`. ADR
[0550](./0550-promise-like-native-adapter.md) introduced native
`PromiseLike<T>` descriptors plus `topaz_promise_like_to_promise(...)`, and
ADR [0553](./0553-promise-then-promise-like-return.md) opened the adjacent
one-handler `.then` callback return bridge for static native `PromiseLike<U>`.
TypeScript's `Promise.catch` surface accepts callback returns of
`T | PromiseLike<T>`, so the catch-side bridge is the next explicit
compatibility surface.

## Decision

Accept static native `PromiseLike<T>` returns only for one-argument
`Promise<T>.catch(onRejected)`. The descriptor payload must exactly match the
source Promise payload, the chained call result remains `Promise<T>`, and the
rejected runner normalizes the descriptor with
`topaz_promise_like_to_promise(...)` before reusing
`topaz_promise_forward_into(...)`.

Rejected alternatives: allowing `PromiseLike<U>` where `U != T` would introduce
a catch result widening policy; widening a generic Promise callback helper
would silently open two-handler `.then` and `.finally` positions; structural
thenable probing would cross the native descriptor boundary from ADR 0550; and
`Promise.resolve(Promise<T>)` flattening remains a separate semantics decision.

## Implementation

- `src/codegen.ts:13006` infers matching `PromiseLike<T>` catch callback
  returns as a chained `Promise<T>` and keeps mismatched payloads as a focused
  diagnostic.
- `src/codegen.ts:13148` adds the rejected-runner branch that receives the
  `topaz_promise_like *` descriptor, converts it to a native Promise, and
  forwards settlement through the existing path.
- `examples/promise_catch_return_promise_like.ts:1` covers fulfilled-source
  bypass, native Promise return through an expected `PromiseLike<T>` annotation,
  returned rejection forwarding, nested FIFO ordering, and callback throw
  precedence.
- `examples/promise_catch_return_promise_like_fail.ts:1` pins the
  `PromiseLike<U>` where `U != T` boundary.

## Consequences

- **Accepted**: `.catch(onRejected)` callbacks annotated as
  `PromiseLike<T>` can return native Topaz Promises through the descriptor
  adapter and still produce a Topaz-owned `Promise<T>`.
- **Rejected**: mismatched payloads, two-handler `.then`, sentinel handler
  forms, `.finally`, structural thenables, `Promise.resolve(Promise<T>)`
  flattening, async `PromiseLike<T>` return annotations, for-await, scheduler
  changes, and unhandled rejection reporting remain out of scope.
- **Regression**: `promise_catch_return_promise_like` and
  `promise_catch_return_promise_like_fail`; smoke now covers 602 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries, plus the existing
  static ADR/MEMO contract.
