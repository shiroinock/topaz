# 0512 - promise finally cleanup continuations

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.45

## Context

ADR [0510](./0510-promise-catch-rejection-continuations.md) and ADR
[0511](./0511-promise-then-rejection-continuations.md) completed rejection
continuations for `.catch` and two-handler `.then`. `.finally` was the
remaining small Promise method surface before broader thenable assimilation,
handler normalization, or public scheduler work.

## Decision

Accept only `Promise<T>.finally(onFinally)` where `onFinally` is exactly
`() => void`; the chained result remains `Promise<T>`. The cleanup callback is
scheduled as a microtask for both source fulfillment and rejection. If cleanup
returns normally, the target Promise preserves the original fulfilled payload
or rejected class-instance payload. If cleanup throws, the thrown class
instance rejects the target and overrides the source settlement. Rejected
alternatives: ignored non-void cleanup results, Promise-returning cleanup
thenable assimilation, optional / non-function handler normalization, unhandled
rejection reporting, and public scheduler APIs remain out of scope.

## Implementation

- `runtime/runtime.h:98` adds a settled Promise continuation kind without
  adding a new helper symbol.
- `runtime/runtime.h:165` and `runtime/runtime.h:240` enqueue settled
  continuations for both fulfilled and rejected sources, including already
  settled sources.
- `src/codegen.ts:11772` validates cleanup callbacks as `() => void`.
- `src/codegen.ts:11855` enforces one argument, rejects Promise-returning
  cleanup callbacks, rejects non-void cleanup returns, and preserves the source
  `Promise<T>` type.
- `src/codegen.ts:11975` emits typed cleanup trampolines that run under the
  existing exception frame, preserve normal source settlement, and convert
  cleanup throws into target rejection.
- `src/codegen.ts:12091`, `src/codegen.ts:13233`, and
  `src/codegen.ts:15664` lower and infer `.finally` while leaving other
  Promise methods on the existing deferred path.
- `src/runtime_header.ts` was regenerated from `runtime/runtime.h`.

## Consequences

- **Accepted**: `promise_finally` covers fulfilled preservation, rejected
  preservation, `Promise<void>` fulfillment, FIFO ordering relative to
  existing `.then` continuations, and cleanup throw override.
- **Rejected**: wrong arity, parameterful cleanup, non-void cleanup return,
  Promise-return cleanup, and non-function cleanup are smoke-pinned.
- **Regression**: smoke now covers 480 explicit run entries, including
  `promise_finally`,
  `promise_finally_wrong_arity_fail`,
  `promise_finally_parameter_fail`,
  `promise_finally_non_void_return_fail`,
  `promise_finally_return_promise_fail`, and
  `promise_finally_non_fn_fail`. The positive TypeScript syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_finally.ts`.
- **Scope out**: no ignored cleanup result widening, Promise-return cleanup
  assimilation, optional handler normalization, unhandled rejection reporting,
  public scheduler API, or async frame rejection resumption is implemented
  here.
