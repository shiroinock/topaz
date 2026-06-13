# 0473 - async frame await lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.6

## Context

ADR [0327](./0327-fiber-async-await-design.md) selected Topaz-owned Promise
and async/await lowering with cooperative scheduling. ADRs
[0468](./0468-promise-type-frontier.md),
[0469](./0469-promise-resolve-reject-value-surface.md),
[0470](./0470-promise-then-fulfillment-continuations.md),
[0471](./0471-async-function-no-await-lowering.md), and
[0472](./0472-basic-await-binding-lowering.md) landed Promise types, value
allocation, fulfillment-only `.then`, no-await async functions, and one
top-level await binding. The next design question was whether multiple awaits
should grow nested Promise chains or move now to the async frame architecture.

## Decision

Adopt compiler-generated async frames as the durable architecture for
`async function` lowering. A frame owns the stable output Promise, stores a
resume pc, captures parameters, stores awaited binding payloads that survive
later suspension points, and is resumed by Promise continuation runners.
Promise helpers are low-level wiring only: `topaz_promise_then_into` registers
continuations into an existing target Promise so async functions keep one
output identity across all awaits. Rejected alternatives: nested continuation
chains, synchronous Promise unboxing, fulfilled-only shortcuts, arbitrary await
expression placement, cleanup-dispatch crossings, and thenable assimilation
remain deferred.

## Implementation

- `src/codegen.ts:4298` discovers all supported top-level await bindings,
  validates `const` / `let`, `Promise<T>` operands, optional annotations, and
  rejects any await outside the narrow declaration-initializer shape.
- `src/codegen.ts:4410` allocates the async frame before running the prefix,
  initializes its output Promise, captures parameters, schedules the first
  awaited source with `topaz_promise_then_into`, and converts prefix throws
  into rejection of the frame-owned output Promise.
- `src/codegen.ts:4454` emits one resume runner per async function with a pc
  switch, per-await payload storage, per-segment locals restored from the
  frame, next-await scheduling, and final `return` fulfillment through the
  existing async continuation target path.
- `runtime/runtime.h:213` adds `topaz_promise_then_into`; `runtime/runtime.h:240`
  keeps `topaz_promise_then` as an allocating wrapper, and
  `src/runtime_header.ts` embeds the refreshed runtime header.
- `scripts/check-runtime-substrate.mjs:318` and `tests/smoke.sh:974` classify
  the new helper as Promise continuation substrate and update the guarded
  saturation count.

## Consequences

- **Accepted**: `async_await_two_bindings` demonstrates synchronous prefix
  execution, two top-level await bindings, use of the first awaited payload
  after the second await, caller-tail ordering, suffix execution in later
  microtasks, and final `.then` ordering.
- **Preserved**: `async_await_basic` remains the one-await regression, now
  lowered through the same frame machinery.
- **Rejected**: `await_expression_deferred_fail`,
  `await_non_promise_fail`, `await_multiple_deferred_fail`,
  `await_return_expr_deferred_fail`, and `await_try_deferred_fail` keep
  top-level/non-async await, non-Promise operands, nested/arbitrary await
  placement, `return await`, and cleanup-dispatch crossings outside this phase.
- **Regression**: smoke now contains 424 explicit `run_*` invocations, including
  the new positive multi-await sample and the updated multiple-await deferred
  boundary. The TS-compatible positive sample is also checked with
  `pnpm exec tsc --noEmit --skipLibCheck examples/async_await_two_bindings.ts`.
- **Scope out**: no top-level await, async arrow/method/generator lowering,
  arbitrary await expressions, await inside nested blocks or try/catch/finally,
  ordinary local capture across later awaits, rejection handler surface,
  unhandled rejection reporting, timers, I/O event-loop integration, or
  parallel scheduler semantics is implemented here.
