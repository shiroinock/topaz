# 0476 - no-await async method lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.9

## Context

ADR [0327](./0327-fiber-async-await-design.md) selected Topaz-owned
async/await lowering, and ADRs [0468](./0468-promise-type-frontier.md)
through [0475](./0475-async-arrow-await-frame-lowering.md) built the Promise
value, continuation, top-level async function, and async arrow substrate. The
remaining TS-compatible no-suspension class gap was `async method(): Promise<T>`
syntax.

## Decision

Accept class async methods that contain no `await`, and lower them as ordinary
methods whose ABI returns `Promise<T>`. Method collection and interface/vtable
checks see the declared `Promise<T>` return type, while method body return
statements are checked against payload `T`. The body runs synchronously when the
method is called; `return T`, `Promise<void>` fallthrough, and escaping
class-instance throws become fulfilled or rejected Topaz Promises. Rejected
alternatives: async method await-frame lowering, async-specific vtable wrappers
or variance, async constructors, async function expressions, rejection handlers,
`PromiseLike`, thenable assimilation, and scheduler modes remain separate
phases.

## Implementation

- `src/ast.ts:575`, `src/convert_from_tsc.ts:367`, and
  `src/topaz_parser.ts:490` preserve an `isAsync` flag on non-constructor class
  methods while keeping async constructors unsupported.
- `src/codegen.ts:3573` requires async method annotations to be `Promise<T>`
  and stores that return type unchanged for exact interface method matching.
- `src/codegen.ts:3757` emits async methods with the normal method signature
  while checking body returns against payload `T`.
- `src/codegen.ts:3794` wraps no-await async method bodies in a local
  `topaz_try_frame`, resolving normal completion and rejecting escaping throws,
  and reports `async method with await is deferred until async method frame
  lowering` when a method body contains `await`.

## Consequences

- **Accepted**: `async_method_no_await` covers `this`, a method parameter,
  exact interface matching for `Promise<number>`, synchronous method body
  execution, and FIFO `.then` callback ordering.
- **Rejected**: `async_method_deferred_fail` now reaches codegen and fails only
  when an async method contains `await`.
- **Regression**: smoke has 429 top-level `run_*case` invocations, adding the
  positive async-method sample and retargeting the existing deferred boundary.
  The positive sample is also checked with `pnpm exec tsc --noEmit
  --skipLibCheck examples/async_method_no_await.ts`.
- **Scope out**: no async method await-frame lowering, async function
  expressions, async constructors, Promise rejection handler surface,
  `PromiseLike`, thenable assimilation, timers, I/O scheduling, or scheduler
  mode behavior is implemented here.
