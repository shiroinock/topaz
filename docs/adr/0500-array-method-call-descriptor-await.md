# 0500 - Array method call descriptor await

- **Status**: Accepted
- **Date**: 2026-06-13
- **Phase**: 5.33

## Context

ADR [0499](./0499-process-write-call-descriptor-await.md) completed the
process-write descriptor slice, and the remaining low-risk receiver-method
family is callback-less Array calls with stable normal-call semantics.
`Array.includes`, `Array.slice`, and `Array.join` already have explicit
arity, type, return, equality, and scalar-element diagnostics. The async
call-argument await machinery needs to reuse those contracts without crossing
callback ABI, mutating/spread, Promise API, thenable, or scheduler boundaries.

## Decision

Extend descriptor-backed call-argument await to `Array.includes`,
`Array.slice`, and `Array.join` only. The ordinary call plan now carries Array
receiver metadata, parameter metadata, return type, element type, and the
existing diagnostic label, so declaration initializers, terminal returns, and
expression-statement discard can replace one direct awaited argument and then
resume through the normal Array method emitter. Receiver ordering follows the
existing descriptor temp model: evaluate and store the Array receiver before
suspension, then restore it and evaluate the resumed call arguments. Rejected
alternatives: adding an async-only Array branch would duplicate normal call
diagnostics; including `map` / `filter` would require callback ABI and result
monomorph decisions; including `push` would mix in void/spread/mutation;
including `pop` adds no awaited-argument surface; `process.exit`, Promise
APIs, thenable assimilation, and scheduler/task-queue semantics remain separate
phases.

## Implementation

- `src/codegen.ts:302` adds the `array_method` ordinary call plan variant.
- `src/codegen.ts:5069` stores Array receivers in the same pre-await receiver
  temp path used by class/interface/Map/Set/String receiver descriptors.
- `src/codegen.ts:11548` adds `resolveArrayMethodCallPlan(...)` for
  `includes(value): boolean`, `slice(start?, end?): Array<T>`, and
  `join(separator?): string`, preserving existing Array diagnostics and
  scalar join restrictions.
- `src/codegen.ts:12196` lets only `includes` / `slice` / `join` reach the
  Array descriptor plan when an awaited argument is being decomposed; callback
  and mutating methods still fall back to the standard deferred await
  diagnostic.
- `src/codegen.ts:12578` routes normal Array `includes` / `slice` / `join`
  emission through the ordinary call plan before reusing the existing
  `emitArrayMethodCall(...)` body.
- `src/codegen.ts:14974` routes value inference for the same three methods
  through the descriptor return type while leaving `map`, `filter`, `push`,
  and `pop` on their existing paths.
- `MEMO.md:424` records phase 5.33 and its remaining async/runtime
  boundaries.

## Consequences

- **Accepted**: block-bodied async function declarations, async arrows, async
  class methods, and anonymous async function expressions can use one direct
  awaited argument in declaration initializers, terminal returns, and
  expression-statement discard for `Array.includes`, `Array.slice`, and
  `Array.join`.
- **Preserved**: `includes` remains one-argument only, uses existing
  SameValueZero/reference-identity behavior, and still rejects `fromIndex`.
- **Preserved**: `slice` keeps at most two number bounds and the existing
  NaN/default sentinel behavior for omitted bounds.
- **Preserved**: `join` keeps one optional string separator and remains limited
  to number / boolean / string element arrays.
- **Deferred**: Array callback methods (`map` / `filter`), mutating/spread
  methods (`push`), `process.exit`, Promise APIs, PromiseLike / thenable
  assimilation, scheduler/task-queue semantics, nested arguments, multiple
  awaits, assignment await, and general expression decomposition stay outside
  this phase.
- **Regression**: `examples/async_await_array_method_call_arg.ts` covers the
  accepted async surfaces, receiver-before-await ordering, resumed output, and
  `.then` observers after completion.
- **Regression**: `examples/await_call_arg_method_deferred_fail.ts` now pins
  awaited Array callback method arguments on the standard deferred await
  diagnostic.
- **Regression count**: the smoke suite now has 459 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
