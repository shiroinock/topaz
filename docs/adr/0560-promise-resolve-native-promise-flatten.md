# 0560 - promise resolve native promise flatten

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.93

## Context

ADR [0552](./0552-promise-like-resolve-bridge.md) kept native `Promise<T>`
operands opaque while adding the explicit `PromiseLike<T>` bridge. That left
`Promise.resolve(Promise<T>)` as the adjacent static compatibility gap: the
operand was treated as an ordinary payload, so Topaz inferred
`Promise<Promise<T>>` even though the operand was already a Topaz-owned native
Promise.

## Decision

Flatten only statically native Topaz `Promise<T>` operands in
`Promise.resolve(...)` by returning the source expression as the resulting
`Promise<T>`. `PromiseLike<T>` remains on the descriptor bridge path through
`topaz_promise_like_to_promise(...)`, and scalar / void operands keep the
existing fulfilled-copy / void allocation paths.

Rejected alternatives: probing arbitrary structural `.then` objects would widen
this slice into thenable assimilation; aliasing `PromiseLike<T>` to `Promise<T>`
would erase the descriptor boundary from ADR 0549; allocating a fresh Promise
and forwarding the native operand would add scheduler behavior where identity
preservation is enough; changing callback return assimilation belongs to the
Promise method phases rather than this static `Promise.resolve` surface.

## Implementation

- `src/codegen.ts:12739` now recognizes an inferred native `Promise<T>` operand
  before the `PromiseLike<T>` branch and returns that same type as the result.
- `src/codegen.ts:12862` emits native Promise operands with the expected
  `Promise<T>` type directly, preserving source identity and settlement.
- `examples/promise_resolve_promise_flatten.ts:1` covers nested native
  flattening, fulfilled and rejected forwarding, PromiseLike bridge
  preservation, and scalar resolve preservation.
- `examples/promise_resolve_structural_thenable_fail.ts:1` pins structural
  `.then` classes as non-assimilated by keeping the inferred result
  `Promise<StructuralThenable>`.
- `examples/async_await_promise_resolve_call_arg.ts:31` removes the TypeScript
  mismatch marker and asserts the flattened `Promise<number>` result.
- `MEMO.md:486` records the Phase 5.93 roadmap item.

## Consequences

- **Accepted**: `Promise.resolve(value: Promise<T>)` now returns the same
  `Promise<T>` expression for native Topaz promises.
- **Preserved**: `Promise.resolve(value: PromiseLike<T>)` still uses the
  explicit bridge helper, and `Promise.resolve(value: T)` still allocates a
  fulfilled Promise payload copy.
- **Rejected**: structural thenable probing, arbitrary `.then` assimilation,
  async `PromiseLike<T>` return annotations, Promise combinator changes,
  scheduler changes, and unhandled rejection reporting remain out of scope.
- **Regression**: `promise_resolve_promise_flatten`,
  `promise_resolve_structural_thenable_fail`, and
  `async_await_promise_resolve_call_arg` cover the new boundary.
- **Regression count**: smoke covers 616 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries, plus the existing
  static ADR/MEMO contract.
