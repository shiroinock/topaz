# 0469 - promise resolve reject value surface

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.2

## Context

ADR [0468](./0468-promise-type-frontier.md) made `Promise<T>` a Topaz-owned
opaque annotation type but deliberately left every value-producing Promise
surface deferred. The next async/await compatibility slice needs actual
Topaz-owned Promise values to pass through annotations and signatures before
continuation frames, microtasks, thenable assimilation, or `await` lowering can
be attached safely.

## Decision

Accept `Promise.resolve()` as `Promise<void>`, accept `Promise.resolve(value)`
for the existing value-representable Promise payload frontier, and accept
`Promise.reject(classInstance)` only when a contextual expected type is already
`Promise<T>`. Fulfilled payloads are copied into arena storage after evaluating
the source expression once; rejected payloads store the class-instance pointer.
Rejected alternatives: inferring a generic/bottom type for bare
`Promise.reject` was rejected because Topaz has no bottom Promise inference
yet; treating `Promise.resolve(undefined)` as `Promise<void>` was rejected to
avoid broadening `Promise<undefined>`; implementing `.then` or synchronous
observation was rejected because scheduler continuations remain the next slice.

## Implementation

- `runtime/runtime.h:89` adds `topaz_promise`, fulfilled/rejected state, copied
  payload storage, and `topaz_promise_resolve_copy`,
  `topaz_promise_resolve_void`, and `topaz_promise_reject`.
- `src/codegen.ts:9260` recognizes static Promise calls and keeps unknown
  `Promise.*` plus instance methods on the existing runtime/scheduler
  diagnostic.
- `src/codegen.ts:9279` infers `Promise.resolve()` / `Promise.resolve(value)`
  and rejects wrong arity or unsupported payloads such as one-arg
  `undefined`.
- `src/codegen.ts:9314` lowers non-void `Promise.resolve(value)` through a
  temporary and `sizeof(tmp)` so the payload expression is evaluated once.
- `src/codegen.ts:9328` validates contextual `Promise.reject` as
  class-instance-only, and `src/codegen.ts:12674` lets expected-type sites
  validate it before non-contextual inference rejects it.
- `scripts/check-runtime-substrate.mjs:41` classifies the three Promise value
  helpers as `promise-value-boundary`, keeping new C substrate visible in
  smoke without folding it into scheduler semantics.

## Consequences

- **Accepted**: positive TS-compatible samples `promise_resolve_value` and
  `promise_reject_value` create and pass opaque Promise values without
  observing them.
- **Rejected**: `Promise.resolve` wrong arity, `Promise.resolve(undefined)`,
  bare `Promise.reject`, non-class rejection values, wrong `Promise.reject`
  arity, `.then` / `.catch` / `.finally`, async functions, `await`, for-await,
  thenable assimilation, timers, event loops, and I/O integration.
- **Regression**: smoke now covers 398 explicit run entries. The positive
  TypeScript syntax check used
  `pnpm exec tsc --noEmit --skipLibCheck examples/promise_resolve_value.ts examples/promise_reject_value.ts`
  because standalone repository checks may include ambient Node type noise.
- **Scope out**: no scheduler queue, continuation frame, callback dispatch,
  Promise instance methods, `PromiseLike`, async arrow/method lowering, or
  fake synchronous JS Promise semantics is implemented here.
