# 0552 - promise like resolve bridge

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.85

## Context

ADR [0549](./0549-promise-like-bridge-boundary.md) kept `PromiseLike<T>` as an
explicit bridge boundary, ADR [0550](./0550-promise-like-native-adapter.md)
introduced the native descriptor plus `topaz_promise_like_to_promise(...)`, and
ADR [0551](./0551-promise-like-await-bridge.md) used that helper for supported
await operands. The remaining adjacent bridge surface was
`Promise.resolve(PromiseLike<T>)`, which still produced the deferred
`Promise.resolve payload type topaz_promise_like_number is unsupported`
diagnostic even when the operand was already a native Topaz descriptor.

## Decision

Accept only static native Topaz `PromiseLike<T>` descriptors in
`Promise.resolve(...)` and normalize them to `Promise<T>` with
`topaz_promise_like_to_promise(...)`. `Promise.resolve(Promise<T>)` remains the
existing non-flattening value-copy surface that returns `Promise<Promise<T>>`,
and ordinary payloads keep using the existing copy/void allocation path.

Rejected alternatives: aliasing `PromiseLike<T>` to `Promise<T>` would erase the
descriptor boundary from ADR 0549; probing arbitrary structural `.then` objects
would combine this bridge with thenable assimilation; flattening static
`Promise<T>` operands would change the existing Topaz Promise value surface;
accepting async `PromiseLike<T>` return annotations would widen a separate
function-boundary rule.

## Implementation

- `src/codegen.ts:12638` shares `Promise.resolve` analysis between inference and
  emission so the inferred `Promise<T>` result still remembers whether the
  original operand was `PromiseLike<T>`.
- `src/codegen.ts:12760` emits `PromiseLike<T>` operands as
  `topaz_promise_like_to_promise(<operand>)` before the existing void and
  value-copy branches.
- `src/codegen.ts:13635` keeps descriptor-backed synthetic
  `Promise.resolve(...)` calls aligned with the original operand type.
- `examples/promise_like_resolve_deferred_fail.ts:1` is converted from a
  deferred-fail sample into a positive sample covering assignment, return, native
  `Promise<T>` through an expected `PromiseLike<T>` parameter, and observable
  settlement through the normalized `Promise<T>`.
- `MEMO.md:478` records the Phase 5.85 roadmap item.

## Consequences

- **Accepted**: `Promise.resolve(value: PromiseLike<T>)` now returns
  `Promise<T>` for native Topaz descriptors.
- **Rejected**: structural thenable probing, `Promise.resolve(Promise<T>)`
  flattening, async `PromiseLike<T>` return annotations, for-await, scheduler
  changes, and unhandled rejection changes remain out of scope.
- **Regression**: `promise_like_resolve_deferred_fail` is now a positive smoke
  case; `promise_like_async_return_fail`,
  `promise_like_structural_adapter_fail`,
  `promise_like_unknown_payload_fail`, `promise_resolve_undefined_fail`, and
  `for_await_deferred_fail` remain negative.
- **Regression count**: smoke covers 603 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries, plus the existing
  static ADR/MEMO contract.
