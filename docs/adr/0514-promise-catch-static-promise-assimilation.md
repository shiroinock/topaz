# 0514 - promise catch static promise assimilation

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.47

## Context

ADR [0513](./0513-promise-then-static-promise-assimilation.md) added static
Promise-return assimilation for one-handler `.then` and introduced the reusable
`topaz_promise_forward_into` settlement forwarding helper. `.catch` recovery
callbacks still rejected every `Promise<T>` return, even when the recovery type
was the same payload as the source Promise and no branch join was required.

## Decision

Accept static Promise assimilation for `Promise<T>.catch(onRejected)` only when
the rejected handler return type is exactly `Promise<T>`. The chained result
remains `Promise<T>`: fulfilled sources bypass the handler and propagate their
payload, rejected sources run the handler asynchronously and forward the
returned Promise's eventual settlement into the existing target. Rejected
alternatives: `Promise<U>` where `U != T` waits for an explicit recovery
result-type policy, two-handler `.then` Promise-return branches still need a
branch join design, `.finally` Promise-return cleanup must preserve original
settlement after waiting, and arbitrary `PromiseLike` / thenable probing remains
out of scope.

## Implementation

- `src/codegen.ts:11840` accepts `.catch` Promise-return callbacks only when the
  returned Promise payload exactly matches the source payload.
- `src/codegen.ts:11841` keeps mismatched Promise payloads as a compile-time
  diagnostic instead of widening the catch result.
- `src/codegen.ts:11945` keys catch runners by source payload and callback
  return type so value-return and Promise-return handlers for the same `T` do
  not collide.
- `src/codegen.ts:11972` emits Promise-return catch runners that invoke the
  callback under the existing exception frame, call `topaz_promise_forward_into`
  for normal returned Promises, and reject the target when the callback throws.

## Consequences

- **Accepted**: `promise_catch_return_promise` covers fulfilled bypass,
  fulfilled returned-Promise recovery, returned rejection recovery,
  nested/pending FIFO ordering, and callback throw override.
- **Rejected**: `promise_catch_return_promise_fail` covers mismatched returned
  Promise payloads, while existing `promise_catch_deferred_fail`,
  `promise_then_two_handler_return_promise_fail`, and
  `promise_finally_return_promise_fail` keep adjacent deferred surfaces explicit.
- **Regression**: smoke now covers 482 explicit run entries, including the new
  positive catch assimilation case. The positive TypeScript syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_catch_return_promise.ts`.
- **Scope out**: no catch result widening, two-handler Promise-return joins,
  `.finally` cleanup waiting, arbitrary thenable assimilation, optional handler
  normalization, public scheduler API, or unhandled rejection reporting is
  implemented here.
