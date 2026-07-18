# 0640 - Async array spread call source leaves

- **Status**: Accepted
- **Date**: 2026-07-19
- **Phase**: 5.173

## Context

[0612](./0612-descriptor-local-array-spread-call-source-leaves.md) accepted
descriptor-local array spread sources whose source is a descriptor-backed
`call_expr` with supported awaits. [0639](./0639-async-array-literal-spread-steps.md)
then allowed root async array literal spread sources only when they contained no
nested `await`, by snapshotting the source before the next suspension and
leaving final copying to the synchronous array spread plan. The remaining narrow
gap was root array literals such as `...items(await p)`.

## Decision

Accept only descriptor-backed `call_expr` spread sources in root async
multi-await array literals. The spread-source call enters the existing nested
call descriptor planner, its awaited arguments and child materializations join
the same source-order frame events as neighboring array elements, and the final
array literal is rewritten so only the spread source becomes the materialized
call-result temp. Rejected alternatives: a general expression-decomposition IR,
async-aware spread copy emission, target-reference descriptors, arbitrary
awaited spread sources, and broader single-await initializer semantics.

## Implementation

- `src/codegen.ts:7449` extracts nested-call descriptor materialization so both
  call arguments and root array literals share ordinary call resolution,
  receiver/argument temp planning, and post-await result temp emission.
- `src/codegen.ts:8467` builds root async array literal plans from direct await,
  safe snapshot, and awaited spread-source call events, replacing the spread
  source expression with the nested call result temp.
- `src/codegen.ts:8894` enables awaited spread-source calls only for the root
  array literal collector; object and statement-discard callers pass `false`
  and keep their previous deferred boundary.
- `tests/smoke.sh:3122` promotes the previous spread-source await fixture to a
  positive regression, and `tests/smoke.sh:3123` adds an order-sensitive
  spread-call materialization case.

## Consequences

- **Accepted**: `examples/await_array_literal_spread_await_source_deferred_fail.ts`
  now compiles and proves the first spread element is the awaited `0`.
- **Accepted**: `examples/await_array_literal_spread_call_source_order.ts`
  proves safe spread snapshots, spread-source call materialization, later
  awaited elements, and final synchronous spread copying stay source-ordered.
- **Rejected**: conditional/non-call awaited spread sources still report
  `await expression lowering is deferred`.
- **Preserved**: non-array spread source and element type mismatch diagnostics
  remain owned by `buildArrayLiteralSpreadPlan`.
- **Regression count**: smoke covers 718 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: object spread, call/new argument spread, optional/element calls,
  constructor calls, target-reference descriptors, scheduler/runtime work, and
  PromiseLike/thenable behavior remain deferred.
