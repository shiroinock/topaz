# 0515 - promise then two-handler static promise assimilation

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.48

## Context

ADR [0513](./0513-promise-then-static-promise-assimilation.md) added static
Promise-return assimilation for one-handler `.then`, and ADR
[0514](./0514-promise-catch-static-promise-assimilation.md) reused the same
`topaz_promise_forward_into` helper for `.catch`. Two-handler
`Promise<T>.then(onFulfilled, onRejected)` still rejected Promise-returning
branches even when both callbacks returned exactly the same Topaz-owned
`Promise<U>`.

## Decision

Accept static Promise assimilation for two-handler `.then` only when both
callbacks return `Promise<U>` with the exact same payload `U`. The chained
result is that shared `Promise<U>` target: the existing fulfillment and
rejection continuations are registered against one pending Promise with bypass
propagation disabled, and whichever branch runs forwards its returned Promise
into the target. Rejected alternatives: mixed value/Promise branch results,
different Promise payloads, optional non-function handler normalization,
arbitrary `PromiseLike` / thenable probing, and `.finally` Promise-return
cleanup waiting remain out of scope.

## Implementation

- `src/codegen.ts:11811` detects two-handler `.then` Promise-return branches
  and requires both callbacks to return `Promise<U>`.
- `src/codegen.ts:11818` preserves the same-return-type invariant by rejecting
  different returned Promise payloads.
- `src/codegen.ts:12079` registers the rejected-branch runner against the
  shared target payload so value-return and Promise-return two-handler chains
  reuse the existing branch-specific continuation machinery.
- `src/codegen.ts:11994` already forwards Promise-return callback results via
  `topaz_promise_forward_into`, so no runtime change is needed.
- `MEMO.md:441` records the 5.48 completion boundary without reopening
  broader thenable work.

## Consequences

- **Accepted**: `promise_then_two_handler_return_promise` covers fulfilled
  branch Promise return, rejected branch Promise return, returned rejection
  recovery from both branches, callback throw override, and FIFO ordering.
- **Rejected**: mixed value/Promise branches in both directions,
  different returned Promise payloads, and `.finally` Promise-return cleanup
  remain smoke-pinned.
- **Regression**: smoke now covers 487 explicit run entries, including the new
  positive case and the new different-payload fail case. The positive
  TypeScript syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_then_two_handler_return_promise.ts`.
- **Scope out**: no mixed branch normalization, result joins, arbitrary
  thenables, optional handler normalization, unhandled rejection reporting,
  public scheduler API, or async frame rejection resumption is implemented
  here.
