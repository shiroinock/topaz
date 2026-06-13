# 0475 - async arrow await-frame lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.8

## Context

ADR [0327](./0327-fiber-async-await-design.md) selected Topaz-owned
async/await lowering, and ADRs [0468](./0468-promise-type-frontier.md)
through [0474](./0474-no-await-async-arrow-lowering.md) landed Promise values,
continuations, async function await frames, and no-await async arrows. The
remaining TS-compatible arrow gap was a block-bodied async arrow whose body
uses the already-supported top-level await binding shape.

## Decision

Reuse the ADR [0473](./0473-async-frame-await-lowering.md) async frame
machinery for async arrows instead of adding a parallel runner. The frame keeps
the same pc/output Promise/await-payload fields, stores arrow params like
function params, and additionally stores the existing arrow env pointer when
captures exist. Runner emission restores `void *__topaz_env` so the ordinary
`captureContext` read path preserves capture-by-value semantics across
suspension. Rejected alternatives: copying each capture into the async frame was
unnecessary duplication, changing captures to by-reference semantics would
break the existing arrow divergence, and expanding to `return await`,
arbitrary await placement, rejection handlers, thenable assimilation, or
scheduler modes would cross this phase boundary.

## Implementation

- `src/codegen.ts:133` names the arrow capture context so async frame runner
  emission can accept it without introducing a self-host-hostile object literal.
- `src/codegen.ts:4414` generalizes async frame body emission from top-level
  function signatures to a param list plus optional capture context, and writes
  `__topaz_env` into the frame when the arrow has captures.
- `src/codegen.ts:4462` emits the optional `void *__topaz_env` frame field and
  restores it at runner entry before emitting resumed statements under the
  existing captureContext.
- `src/codegen.ts:5547` detects supported await bindings in async arrow block
  bodies and routes them through the shared frame lowering; no-await arrows keep
  the previous synchronous wrapper path.

## Consequences

- **Accepted**: `examples/async_arrow_await.ts` covers two top-level await
  bindings, parameter use after suspension, captured-value use after
  suspension, and FIFO `.then` ordering.
- **Preserved**: `async_arrow_no_await`, `async_await_basic`, and
  `async_await_two_bindings` keep using their previous surfaces.
- **Rejected**: `async_arrow_deferred_fail` now uses `return await
  Promise.resolve(42)` so unsupported arbitrary/return await inside async
  arrows remains deferred after supported binding awaits are accepted.
- **Regression**: smoke has 433 top-level `run_*` invocations, including
  `async_arrow_await` and the retargeted async-arrow deferred boundary. The new
  positive sample is also checked with `pnpm exec tsc --noEmit --skipLibCheck
  examples/async_arrow_await.ts`.
- **Scope out**: async methods, async function expressions, top-level await,
  arbitrary await expressions, `return await`, await inside try/catch/finally,
  pre-await local capture, ordinary locals crossing a later await, rejection
  handlers, `PromiseLike`, thenable assimilation, timers, I/O scheduling, and
  scheduler modes remain future work.
