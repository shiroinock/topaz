# 0516 - promise finally static promise cleanup

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.49

## Context

ADR [0513](./0513-promise-then-static-promise-assimilation.md),
[0514](./0514-promise-catch-static-promise-assimilation.md), and
[0515](./0515-promise-then-two-handler-static-promise-assimilation.md)
connected static Topaz `Promise<U>` returns for `.then` and `.catch`.
`Promise<T>.finally(onFinally)` still accepted only `void` cleanup callbacks,
so TypeScript-compatible cleanup chains that return a statically known Promise
were rejected before the runtime could wait for cleanup completion.

## Decision

Accept `Promise<T>.finally((): Promise<U> => cleanup)` for any supported Topaz
Promise payload `U`. The chained result remains `Promise<T>`: cleanup
fulfillment ignores `U` and preserves the original source settlement, while
cleanup rejection overrides the source with the cleanup rejection. Rejected
alternatives: synchronous inspection of returned Promises, arbitrary
`PromiseLike` / thenable probing, optional handler normalization, and ignored
scalar cleanup returns remain out of scope.

## Implementation

- `runtime/runtime.h:178` adds a generic cleanup-settlement context that keeps
  the original source Promise while the cleanup Promise is pending.
- `runtime/runtime.h:346` exposes `topaz_promise_finally_cleanup_into`, which
  registers a settled continuation on the returned cleanup Promise.
- `src/codegen.ts:11894` accepts `Promise<U>` cleanup callback returns while
  keeping non-Promise scalar returns rejected.
- `src/codegen.ts:12007` keys generated `finally` runners by payload and
  cleanup return type so void and Promise-return callbacks do not collide.
- `src/codegen.ts:12036` emits Promise-return cleanup runners that call the
  callback, pop the try frame, and delegate preservation / override semantics
  to the runtime helper.
- `scripts/check-runtime-substrate.mjs:318` classifies the two new cleanup
  helpers under the Promise continuation boundary.
- `MEMO.md:442` records the 5.49 boundary without reopening arbitrary
  thenable assimilation.

## Consequences

- **Accepted**: `promise_finally_return_promise` covers fulfilled preserve,
  rejected preserve, fulfilled cleanup override, rejected cleanup override,
  nested cleanup FIFO ordering, and callback throw before returning.
- **Rejected**: scalar cleanup returns, parameterful callbacks, non-function
  callbacks, wrong arity, and class-based thenable-shaped cleanup returns stay
  smoke-pinned.
- **Regression**: smoke now covers 488 explicit run entries, including the new
  positive `promise_finally_return_promise` case. The positive TypeScript
  syntax check is
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_finally_return_promise.ts`.
- **Scope out**: no scalar ignored-return normalization, arbitrary thenables,
  optional handler normalization, unhandled rejection reporting, scheduler API,
  or async frame rejection resumption is implemented here.
