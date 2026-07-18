# 0641 - Async object nested array spread call source leaves

- **Status**: Accepted
- **Date**: 2026-07-19
- **Phase**: 5.174

## Context

[0640](./0640-async-array-spread-call-source-leaves.md) accepted
descriptor-backed awaited `call_expr` spread sources for root async array
literals. Object literal collection already descended through nested arrays, but
kept that collector mode disabled, so contextual object values containing
`xs: [...items(await p)]` still reached the deferred await diagnostic.

## Decision

Accept descriptor-backed awaited spread-source calls in arrays nested inside
non-statement-discard async object literal plans. Root array and contextual
object plans share one multi-await literal planner, which rewrites only the call
source to its result temp and delegates call resolution, argument/receiver temps,
and post-await materialization to the existing nested-call descriptor machinery.
Rejected alternatives: a general expression-decomposition IR, arbitrary or
conditional awaited spread sources, target-reference descriptors, and widening
statement-discard object materialization.

## Implementation

- `src/codegen.ts:8467` routes root arrays through a shared literal event planner;
  `src/codegen.ts:8708` connects non-statement-discard object events to the same path.
- `src/codegen.ts:8975` enables awaited spread-source call collection only for
  contextual object plans and threads the flag through nested object/array leaves.
- `examples/await_object_literal_nested_array_spread_call_source.ts:25` proves a
  contextual object return preserves snapshots, call materialization, later awaits,
  and final object consumption in source order.

## Consequences

- **Accepted**: nested object array fields may use `...items(await p)` when the
  call fits the existing descriptor-backed nested-call restrictions.
- **Rejected**: the conditional spread-source fixture still reports
  `await expression lowering is deferred`.
- **Preserved**: root array spread-call and descriptor-local call-argument cases
  remain on the same planner/materializer path.
- **Regression count**: smoke covers 716 explicit `run_case` /
  `run_module_case` / `run_fail_case` entries.
- **Scope**: object spread, call/new argument spread, optional/element/constructor
  calls, target-reference descriptors, scheduler/runtime work, and thenables remain deferred.
