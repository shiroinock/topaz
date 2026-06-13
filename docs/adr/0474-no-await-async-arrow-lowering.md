# 0474 - no-await async arrow lowering

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.7

## Context

ADR [0327](./0327-fiber-async-await-design.md) selected Topaz-owned
async/await lowering, and ADRs [0468](./0468-promise-type-frontier.md),
[0469](./0469-promise-resolve-reject-value-surface.md),
[0470](./0470-promise-then-fulfillment-continuations.md),
[0471](./0471-async-function-no-await-lowering.md),
[0472](./0472-basic-await-binding-lowering.md), and
[0473](./0473-async-frame-await-lowering.md) built the Promise value,
continuation, async function, and await-frame substrate. The remaining
TS-compatible no-suspension gap was `async (...) => ...` arrow syntax.

## Decision

Accept async arrow functions that contain no `await`, and lower them as ordinary
`fn(...): Promise<T>` values. The arrow body runs synchronously when invoked;
`return T`, expression bodies, `Promise<void>` fallthrough, and escaping
class-instance throws are converted into fulfilled or rejected Topaz Promises.
Rejected alternatives: async-arrow await frame capture, async methods, Promise
rejection handlers, `PromiseLike`, JS thenable assimilation, scheduler modes,
and any shortcut that pretends Promise-returning callbacks are thenables remain
separate phases.

## Implementation

- `src/ast.ts:338` adds `ArrowExpr.isAsync`, and
  `src/convert_from_tsc.ts:1309` preserves async arrow syntax while keeping
  generic/rest/default/optional/destructuring arrow rejections unchanged.
- `src/topaz_parser.ts:1480` recognizes `async (...) => ...`, and
  `src/topaz_parser.ts:1778` records the async flag on parsed arrows.
- `src/codegen.ts:4805` adds async-arrow await detection that stops at nested
  arrows and reports `async arrow with await is deferred until async arrow
  frame lowering`.
- `src/codegen.ts:4876` and `src/codegen.ts:5340` type and emit async arrows as
  `fn(...): Promise<T>` while checking the body against payload `T`.
- `src/codegen.ts:5556` wraps no-await async arrow bodies in a local
  `topaz_try_frame`, resolving normal completion and rejecting escaping throws.

## Consequences

- **Accepted**: `async_arrow_no_await` covers block-bodied and expression-bodied
  async arrows, synchronous body execution, FIFO `.then` callback ordering, and
  TypeScript validity under `tsc`.
- **Rejected**: `async_arrow_deferred_fail` now reaches codegen and fails only
  when an async arrow contains `await`; `async_method_deferred_fail` remains a
  tsc-bridge deferred surface.
- **Regression**: smoke now has 430 top-level `run_*case` invocations, adding
  the positive async-arrow sample while retargeting the existing async-arrow
  fail boundary.
- **Scope out**: no async arrow frame lowering, async methods, rejection handler
  Promise surface, `PromiseLike`, thenable assimilation, scheduler mode,
  timers, I/O scheduling, or parallel scheduler behavior is implemented here.
