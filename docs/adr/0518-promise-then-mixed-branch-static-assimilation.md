# 0518 - promise then mixed branch static assimilation

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.51

## Context

ADR [0511](./0511-promise-then-rejection-continuations.md) accepted
two-handler `.then` when both callbacks returned the same value payload `U`,
and ADR [0515](./0515-promise-then-two-handler-static-promise-assimilation.md)
accepted the same shape when both callbacks returned the same `Promise<U>`.
The remaining narrow static-assimilation gap was a mixed pair: one branch
returns `U`, while the other branch returns a statically known Topaz
`Promise<U>`.

## Decision

Accept mixed value/Promise branch results for two-handler `.then` only when both
callback returns normalize to the exact same payload `U`. A returned
`Promise<U>` normalizes to `U` and keeps using the existing branch runner's
`topaz_promise_forward_into` path; a returned value or `void` normalizes through
`promiseOf(resultType)` and fulfills the shared target directly. Rejected
alternatives: arbitrary thenable / `PromiseLike` probing, optional non-function
handler normalization, result unions, broader return joins, `.catch` behavior
changes, and mixed branches with different normalized payloads.

## Implementation

- `src/codegen.ts:11808` adds a local Promise.then result normalizer that maps
  Promise-return callbacks to their payload and value-return callbacks through
  `promiseOf`.
- `src/codegen.ts:11834` widens only the two-handler compatibility check to
  compare normalized payloads and keeps one-handler `.then` inference
  unchanged.
- `src/codegen.ts:11844` reports mismatched mixed branches in payload terms so
  value/Promise diagnostics do not depend on raw callback return shapes.
- `src/codegen.ts:11952` and `src/codegen.ts:12001` already lower branch
  runners to direct fulfillment for value results and forwarding for
  Promise-return results, so no runtime change is needed.
- `src/codegen.ts:12108` continues to register fulfilled and rejected runners
  against one shared pending target, preserving the existing two-handler FIFO
  continuation behavior.
- `MEMO.md:444` records the 5.51 boundary without reopening thenable,
  optional-handler, unhandled-rejection, or scheduler work.

## Consequences

- **Accepted**: `promise_then_two_handler_mixed_return` covers value/Promise and
  Promise/value branch directions, selected value-branch throw rejection,
  selected Promise-branch returned rejection forwarding, and FIFO ordering.
- **Rejected**: `promise_then_on_rejected_return_promise_fail` and
  `promise_then_two_handler_return_promise_fail` now pin mixed-branch normalized
  payload mismatches; `promise_then_two_handler_return_promise_mismatch_fail`
  keeps Promise/Promise payload mismatch coverage.
- **Regression**: smoke now covers 487 explicit run entries, including the new
  positive case and the updated mismatch diagnostics. The positive TypeScript
  syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_then_two_handler_mixed_return.ts`.
- **Scope out**: no arbitrary thenable or `PromiseLike` assimilation, optional
  handler normalization, result union join, `.catch` change, unhandled rejection
  reporting, public scheduler API, or async frame rejection resumption is
  implemented here.
