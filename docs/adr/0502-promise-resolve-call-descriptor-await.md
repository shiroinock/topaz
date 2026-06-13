# 0502 - Promise.resolve call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.35

## Context

ADRs [0492](./0492-synthetic-call-descriptor-await.md) through
[0501](./0501-array-push-call-descriptor-await.md) moved selected synthetic,
flat builtin, filesystem/process, and Array calls onto the descriptor-backed
call-argument await frontier. `Promise.resolve(value)` was still pinned as a
deferred synthetic namespace call even though ADR
[0469](./0469-promise-resolve-reject-value-surface.md) already owns the
Topaz-only Promise value allocation surface.

## Decision

Extend descriptor-backed call-argument await only to
`Promise.resolve(value)`. The synthetic call plan now exposes zero params for
`Promise.resolve()` and one payload param inferred by the existing
`inferPromiseResolveCall(...)` for `Promise.resolve(value)`, then emits through
the existing `emitPromiseResolveCall(...)` value allocator. Rejected
alternatives: special-casing `tryBuildCallArgAwaitExpression(...)` would
duplicate descriptor metadata; adding `Promise.reject(await error)` would need
contextual expected type and rejection payload rules; flattening
`Promise.resolve(Promise<T>)` or Promise-returning `.then` callbacks would be
JS thenable assimilation work; PromiseLike and scheduler/task-queue semantics
remain separate phases.

## Implementation

- `src/codegen.ts:197` adds the `promise_resolve` synthetic call kind.
- `src/codegen.ts:4975` continues to resolve awaited call arguments through
  the ordinary call descriptor plan, so `Promise.resolve` joins the existing
  await decomposition path instead of a bespoke branch.
- `src/codegen.ts:11817` recognizes only `Promise.resolve(...)` as a synthetic
  Promise namespace descriptor and reuses `inferPromiseResolveCall(...)` for
  arity, type-argument, `undefined`, and payload-frontier diagnostics.
- `src/codegen.ts:12419` routes the descriptor back to
  `emitPromiseResolveCall(...)`, preserving the Topaz-owned opaque Promise
  allocation representation.
- `MEMO.md:428` records phase 5.35 and the still-deferred Promise/runtime
  boundaries.

## Consequences

- **Accepted**: block-bodied async declarations, arrows, class methods, and
  anonymous async function expressions can use direct
  `Promise.resolve(await value)` in declaration initializers, terminal returns,
  and expression-statement discard.
- **Preserved**: `Promise.resolve()` remains `Promise<void>`, wrong arity,
  explicit type arguments, and `Promise.resolve(undefined)` keep their existing
  diagnostics, and `Promise.resolve(Promise<T>)` is just an ordinary opaque
  Promise payload when the existing payload frontier accepts it.
- **Deferred**: `Promise.reject`, rejection handlers, Promise-returning
  callback flattening, PromiseLike / thenable assimilation, top-level await,
  nested arguments, multiple awaits, assignment await, and scheduler/task-queue
  semantics stay outside this phase.
- **Regression**: `examples/async_await_promise_resolve_call_arg.ts` covers
  the accepted async surfaces, pre-await ordering before `sync tail`,
  post-resumption `.then` observers, and opaque nested Promise assignment /
  parameter checks.
- **Regression**: `examples/await_call_arg_builtin_deferred_fail.ts` now pins
  `Promise.reject(await ...)` on the generic deferred call-argument diagnostic.
- **Regression count**: the smoke suite now has 456 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
