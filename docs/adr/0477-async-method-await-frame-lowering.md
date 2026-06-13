# 0477 - async method await-frame lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.10

## Context

ADR [0327](./0327-fiber-async-await-design.md) selected Topaz-owned
async/await lowering, and ADRs [0473](./0473-async-frame-await-lowering.md),
[0475](./0475-async-arrow-await-frame-lowering.md), and
[0476](./0476-no-await-async-method-lowering.md) established shared async
frames, async arrow frames, and ordinary-ABI async methods. The remaining
method gap was the same supported top-level await binding shape already
accepted for functions and block-bodied arrows.

## Decision

Reuse the shared async frame machinery for class async methods and add an
optional concrete receiver carry field. The generated frame stores the method's
`this` pointer, params, prior await payload locals, pc, and output Promise; the
runner restores `__topaz_this` before emitting resumed method statements so
field access and method calls keep using the existing class lowering. Method
and interface/vtable ABI stay unchanged: an async method is still an ordinary
method returning `Promise<T>`. Rejected alternatives: adding async-specific
vtable wrappers would duplicate the current exact method contract, storing an
interface fat pointer would weaken the concrete receiver semantics, and
expanding to arbitrary/return await, rejection handlers, thenable assimilation,
or scheduler modes would cross this phase boundary.

## Implementation

- `src/codegen.ts:133` adds a small receiver context for async frame runner
  emission.
- `src/codegen.ts:3783` routes async methods with supported await bindings into
  the shared frame path while no-await methods keep the previous synchronous
  wrapper.
- `src/codegen.ts:4533` stores method params and, when present, the concrete
  `__topaz_this` pointer into the async frame before scheduling the first await.
- `src/codegen.ts:4567` emits the receiver field and restores a local
  `__topaz_this` in the runner before resuming method body segments.

## Consequences

- **Accepted**: `examples/async_method_await.ts` covers two top-level await
  bindings, `this` after suspension, a method parameter after suspension,
  interface dispatch returning `Promise<number>`, and FIFO `.then` ordering.
- **Preserved**: `async_method_no_await`, `async_arrow_await`,
  `async_await_basic`, and `async_await_two_bindings` keep their existing
  surfaces.
- **Rejected**: `async_method_deferred_fail` now uses `return await
  Promise.resolve(1)` so unsupported arbitrary/return await inside async
  methods remains deferred after supported binding awaits are accepted.
- **Regression**: smoke has 455 `run_*` invocations, including
  `async_method_await` and the retargeted async-method deferred boundary. The
  new positive sample is also checked with `pnpm exec tsc --noEmit
  --skipLibCheck examples/async_method_await.ts`.
- **Scope out**: async function expressions, async constructors, top-level
  await, arbitrary await expressions, `return await`, await inside
  try/catch/finally, ordinary local capture across later awaits, rejection
  handlers, `PromiseLike`, thenable assimilation, timers, I/O scheduling, and
  scheduler modes remain future work.
