# 0327 - fiber async await design

- **Status**: Accepted
- **Date**: 2026-06-07
- **Phase**: 2.4e

## Context

Phase 2.4 split large post-selfhost surfaces into staged decisions before
product behavior changes. Bigint established that pattern in
[0323](./0323-bigint-staged-design.md), and regexp followed it in
[0326](./0326-regexp-minimal-test-surface.md). Async cannot be introduced as a
parser-only feature: `Promise<T>`, `async function`, `await`, exception
resumption, and scheduler ownership all affect ABI, runtime allocation, and
try/catch/finally cleanup dispatch.

## Decision

Adopt `Promise<T>` as a built-in reference family owned by the Topaz runtime,
not a JavaScript-compatible thenable protocol. An `async function` returns
`Promise<T>`; `return value` fulfills its output promise, and `throw
classInstance` rejects it using the existing Topaz restriction that throw values
are class instances. `await` is initially allowed only inside async functions
and only for `Promise<T>` operands. Thenable assimilation, arbitrary `.then`
lookup, and `await` on non-promises remain rejected.

Lower async with compiler-generated Fiber/state-machine frames running on a
single-threaded cooperative scheduler with a microtask queue. A frame contains a
continuation pc, locals that survive suspension, pending result/exception
slots, and the output promise. `await` registers the continuation and yields to
the scheduler; if the awaited promise is rejected, the resumed fiber throws the
rejection reason back through ordinary Topaz exception handling. Broad async
acceptance must wait until try/catch/finally cleanup dispatch works across
suspension.

Rejected alternatives: a Promise-only design without async/await lowering was
rejected because it would not define the compiler frame ABI; a synchronous or
fake Promise skeleton was rejected because it would bake in false ordering
semantics; full ECMAScript thenable assimilation and complete microtask
compatibility were rejected as too broad for the first surface; OS threads or a
libuv-style event loop were rejected because the initial runtime must stay
single-threaded and header-owned.

## Implementation

- `MEMO.md:248` marks 2.4e complete and points the roadmap at this ADR.
- `examples/async_function_deferred_fail.ts:1` records that async function
  declarations still reject before Fiber lowering is implemented.
- `examples/await_expression_deferred_fail.ts:1` records that `await`
  expressions are still rejected before async context/type validation exists.
- `examples/promise_resolve_deferred_fail.ts:1` records that `Promise.resolve`
  is not a placeholder value API yet.
- `examples/for_await_deferred_fail.ts:1` records that for-await remains out of
  scope for the first async surface.
- `tests/smoke.sh:79` adds a TSC-bridge fail helper for diagnostics that the
  current self-host parser rejects before conversion, and
  `tests/smoke.sh:259` adds the four fail regressions without touching `src/`
  or `runtime/`.

## Consequences

- **Accepted**: a later implementation phase should accept async function
  declarations, `await` inside those functions, `Promise.resolve(value)`, and
  `Promise.reject(error)` as the first testable surface.
- **Rejected**: `.then`, `.catch`, `.finally`, Promise combinators, top-level
  await, async arrows, async methods, async generators, for-await,
  cancellation, containers, stdlib async I/O, timers, OS threads, and full event
  loop integration remain follow-up ADRs.
- **Regression**: `async_function_deferred_fail`,
  `await_expression_deferred_fail`, `promise_resolve_deferred_fail`, and
  `for_await_deferred_fail`; the smoke suite now has 331 explicit run entries.
- **Parser frontier**: `for_await_deferred_fail` fixes the current Topaz parser
  reject (`expected '('`) instead of the TSC-bridge `` `for await` is
  unsupported `` diagnostic because this design-only phase deliberately leaves
  product parser/codegen/runtime behavior unchanged.
- **Scope out**: no product async parser/codegen/runtime acceptance is
  implemented in this design-only phase.
