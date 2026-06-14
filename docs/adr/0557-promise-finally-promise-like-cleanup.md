# 0557 - promise finally PromiseLike cleanup bridge

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.90

## Context

ADR [0516](./0516-promise-finally-static-promise-cleanup.md) opened static
`Promise<U>` cleanup waits for `Promise<T>.finally(...)`. ADR
[0550](./0550-promise-like-native-adapter.md) later introduced native
`PromiseLike<T>` descriptors and `topaz_promise_like_to_promise(...)`, and
phases 5.86 through 5.89 used that bridge for supported `then` / `catch`
callback return positions. The remaining explicit bridge surface was finally
cleanup callbacks annotated as `PromiseLike<U>`.

## Decision

Accept static native `PromiseLike<U>` cleanup returns only for
`Promise<T>.finally(() => cleanup)`. The chained call still infers the original
`Promise<T>` shape; cleanup fulfillment waits and preserves the source
settlement, while cleanup rejection overrides it. Lowering converts the
returned descriptor through `topaz_promise_like_to_promise(...)` and then reuses
`topaz_promise_finally_cleanup_into(...)`.

Rejected alternatives: structural thenable probing would cross the native
descriptor boundary; broadening generic Promise callback checks would silently
open deferred branch-join surfaces; flattening `Promise.resolve(Promise<T>)`,
async `PromiseLike<T>` returns, for-await, scheduler changes, and unhandled
rejection reporting remain separate decisions.

## Implementation

- `src/codegen.ts:13056` admits `promise_like` alongside `void`, `Promise<T>`,
  and ignored primitive cleanup returns in `inferPromiseFinallyCall(...)`.
- `src/codegen.ts:13214` emits the `PromiseLike` cleanup runner branch that
  calls the cleanup callback under the existing try frame, normalizes the
  descriptor, and delegates to `topaz_promise_finally_cleanup_into(...)`.
- `examples/promise_finally_return_promise_like.ts:27` covers fulfilled and
  rejected source preservation, cleanup rejection override, nested cleanup FIFO
  ordering, thrown cleanup precedence, and an ignored non-void payload.
- `tests/smoke.sh:3009` adds the positive smoke case, while
  `tests/smoke.sh:3104` keeps non-Promise cleanup values rejected with the
  updated diagnostic text.
- `MEMO.md:483` records the phase boundary without reopening structural
  thenables or scheduler work.

## Consequences

- **Accepted**: TypeScript-compatible `PromiseLike<U>` cleanup annotations can
  return native Topaz Promises through the descriptor bridge and still preserve
  finally semantics.
- **Rejected**: non-Promise class cleanup values, primitive-only ignored-return
  rules, structural thenables, async `PromiseLike<T>` returns, callable
  two-handler `.then` PromiseLike branch joins, for-await, scheduler changes,
  and unhandled rejection behavior remain unchanged.
- **Regression**: `promise_finally_return_promise_like`; smoke covers 605
  explicit `run_case` / `run_module_case` / `run_fail_case` entries.
