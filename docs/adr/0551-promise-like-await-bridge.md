# 0551 - promise like await bridge

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.84

## Context

ADR [0549](./0549-promise-like-bridge-boundary.md) reserved an explicit
compiler-owned `PromiseLike<T>` bridge, and ADR
[0550](./0550-promise-like-native-adapter.md) added the runtime descriptor plus
`topaz_promise_like_to_promise(...)`. The remaining blocker was that supported
await lowering still rejected extracted `PromiseLike<T>` operands before the
existing async frame continuation machinery could observe them.

## Decision

Accept static `PromiseLike<T>` operands only in await positions that already
accept static `Promise<T>`. Await operand analysis now keeps the original
operand type for emission, derives the awaited payload `T`, and also records a
normalized `Promise<T>` source type. `Promise<T>` operands keep the existing C
expression; `PromiseLike<T>` operands emit
`topaz_promise_like_to_promise(<operand>)` before entering
`topaz_promise_then_into(...)`.

Rejected alternatives: aliasing `PromiseLike<T>` to `Promise<T>` would erase
the descriptor boundary; probing structural `.then` shapes would combine bridge
work with thenable assimilation; unwrapping synchronously would bypass the FIFO
Promise continuation model; adding new await syntax positions would widen the
async-frame surface beyond this phase.

## Implementation

- `src/codegen.ts:134` records `sourcePromiseType` on async suspension steps so
  the frame payload type remains `T` while the scheduled source is always a
  `Promise<T>`.
- `src/codegen.ts:5212` through `src/codegen.ts:5468` routes supported await
  operand checks through `resolveAwaitOperand(...)`, including direct bindings,
  initializer awaits, expression/assignment statements, descriptor-backed
  call-argument awaits, and terminal return awaits.
- `src/codegen.ts:6227` and `src/codegen.ts:6638` emit await sources through
  `emitAwaitSourceExpression(...)`, which wraps `PromiseLike<T>` descriptors
  with `topaz_promise_like_to_promise(...)`.
- `src/codegen.ts:12702` adds the shared operand resolver and keeps
  non-Promise diagnostics as `await operand must be Promise<T>, got ...`.
- `src/codegen.ts:5477` mirrors existing carry narrowing during async-frame
  preflight so early-return optional guards can feed the supported await
  operand check.

## Consequences

- **Accepted**: direct parameter, narrowed optional, array extraction, field
  extraction, expression-statement/assignment/compound/call-argument, and
  terminal return await surfaces can bridge static `PromiseLike<T>` operands.
- **Rejected**: `Promise.resolve(PromiseLike<T>)`, async return annotation
  `PromiseLike<T>`, arbitrary structural thenables, for-await, new await
  placement, scheduler changes, and unhandled rejection reporting changes.
- **Regression**: `promise_like_await_deferred_fail`,
  `promise_like_optional_await_deferred_fail`,
  `promise_like_array_await_deferred_fail`, and
  `promise_like_field_await_deferred_fail` are now positive smoke cases;
  `promise_like_async_return_fail`, `promise_like_resolve_deferred_fail`,
  `promise_like_structural_adapter_fail`, `promise_like_unknown_payload_fail`,
  `for_await_deferred_fail`, and `await_non_promise_fail` remain negative.
- **Regression count**: smoke still covers 600 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries, plus the existing
  static ADR/MEMO contract.
