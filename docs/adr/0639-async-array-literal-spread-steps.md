# 0639 - Async array literal spread steps

- **Status**: Accepted
- **Date**: 2026-07-19
- **Phase**: 5.172

## Context

[0611](./0611-array-literal-spread-evaluation-plan.md) split synchronous array
literal spread lowering into a source-order plan, but async multi-await array
literal collection still rejected every spread element at the root. Later async
array-literal phases added `await`, `pure`, and `snapshot` leaves, so the
remaining narrow gap was allowing fixed elements and safe array spread sources
to coexist without introducing target-reference descriptors or a general
expression IR.

## Decision

Accept safe spread sources in root async multi-await array literals by collecting
each spread source with no nested `await` as a snapshot leaf. The existing
multi-await frame evaluates those spread sources into temps before the next
suspension, rewrites the final array literal to use `...temp`, and then lets the
ordinary synchronous array spread plan reserve and append fixed/spread steps in
source order.

Rejected alternatives: target-reference descriptors are still broader than this
array-source snapshot slice; a general expression-decomposition IR would create
premature structure; async-aware spread emission would duplicate ADR 0611's
final materialization path; awaited spread sources such as
`...[items(await p)]` still require a future decomposition boundary.

## Implementation

- `src/codegen.ts:8719` accepts array literal spread elements in the multi-await
  array collector and records their source expression as a snapshot leaf.
- `src/codegen.ts:8748` keeps the accepted spread-source predicate narrow:
  no nested awaits, plus array-literal, side-effect-free, or snapshotable source
  forms.
- `tests/smoke.sh:3120` promotes the existing initializer spread fixture to a
  positive case that prints the returned first element.
- `tests/smoke.sh:3121` adds an order-sensitive fixture proving spread source
  calls occur before the later awaited continuation they precede.
- `tests/smoke.sh:3122` pins `...[items(await ...)]` at the deferred
  await-lowering boundary.

## Consequences

- **Accepted**: `examples/await_initializer_multiple_deferred_fail.ts` and
  `examples/await_array_literal_spread_steps.ts` now cover mixed fixed/spread
  async array literals with multiple awaits.
- **Rejected**: `examples/await_array_literal_spread_await_source_deferred_fail.ts`
  still reports `await expression lowering is deferred`.
- **Preserved**: non-array spread sources and element type mismatches remain
  diagnosed by `buildArrayLiteralSpreadPlan`.
- **Regression count**: smoke covers 717 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
- **Scope**: object spread, call/new argument spread, conditional/short-circuit
  await, target-reference descriptors, scheduler/runtime changes, and
  PromiseLike/thenable behavior remain deferred.
