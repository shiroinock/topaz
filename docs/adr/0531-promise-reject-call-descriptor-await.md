# 0531 - Promise.reject call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.64

## Context

ADR [0502](./0502-promise-resolve-call-descriptor-await.md) moved
`Promise.resolve(await value)` onto the descriptor-backed call-argument await
path, but left `Promise.reject(await error)` deferred because reject needs a
contextual `Promise<T>` target and class-instance rejection validation. The
ordinary contextual `Promise.reject(classInstance)` surface already has those
checks, so this phase only connects that existing Topaz-owned surface to async
call-argument await lowering.

## Decision

Add `Promise.reject` as a synthetic call descriptor only when the await
decomposition caller already has an expected `Promise<T>` return type. The
descriptor reuses `checkPromiseRejectWithExpected(...)` for arity, explicit
type-argument, contextual target, and class-instance validation, and emission
continues through `emitPromiseRejectWithExpected(...)`.

Rejected alternatives: inferring a bottom `Promise<never>` would add a new
Promise inference rule; special-casing async frames without a descriptor would
duplicate call metadata; flattening or assimilating Promise/thenable payloads
would reopen JS semantics intentionally left outside this compatibility slice;
accepting expression-statement discard without context would invent a target
type the existing emitter cannot justify.

## Implementation

- `src/codegen.ts:238` adds the `promise_reject` synthetic call kind.
- `src/codegen.ts:4999` captures annotated initializer context before await
  call-argument decomposition and preserves it for transformed type checking.
- `src/codegen.ts:5199` passes terminal async return payload context into call
  argument await decomposition.
- `src/codegen.ts:5552` threads an optional expected return type through the
  descriptor-backed call-argument await path.
- `src/codegen.ts:13200` resolves `Promise.reject(...)` descriptors only with a
  contextual expected type and validates the awaited error as a class instance.
- `src/codegen.ts:13816` emits the descriptor through the existing contextual
  reject emitter.
- `MEMO.md:457` records the 5.64 roadmap completion line.

## Consequences

- **Accepted**: annotated bindings and terminal async returns can use
  `Promise.reject(await promiseOfError)` when the expected result is
  `Promise<T>`.
- **Preserved**: no-context reject, non-class rejection values, wrong arity,
  explicit type arguments, PromiseLike / thenable assimilation, bottom Promise
  inference, unhandled rejection reporting, and scheduler changes remain
  deferred.
- **Regression**: `examples/async_await_promise_reject_call_arg.ts` covers
  annotated local context, async arrow return, async method return, anonymous
  async function-expression return, `.catch(...)` / two-handler `.then(...)`
  observation, and FIFO ordering around `sync tail`.
- **Regression**: `examples/await_call_arg_builtin_deferred_fail.ts` now pins
  no-context `Promise.reject(await ...)` on the existing generic await-lowering
  diagnostic.
- **Regression count**: the smoke suite now has 547 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
