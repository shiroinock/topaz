# 0620 - Awaited non-array compound assignment call leaves

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.153

## Context

[0619](./0619-awaited-array-element-compound-assignment-call-leaves.md)
accepted `array[index] += await expr` leaves inside supported call-argument
binaries by snapshotting the array, index, and old element before suspending on
the RHS await. The remaining narrow compound-assignment leaves were local
identifiers, concrete class fields, and interface fields. The selected semantics
are the same option B boundary: read the old target value before the RHS await
can run, so mutations performed by the awaited helper do not change the
compound base value.

## Decision

Accept call-argument binary leaves whose assignment owner is a supported
compound assignment to a local identifier, concrete class field, or declared
interface field. The target must contain no await, the RHS must contain exactly
the matched await in the existing simple replacement envelope, and property
receivers must stay within the existing safe lvalue-base envelope. The planner
stores a local old-value temp directly from the binding, stores class/interface
receiver temps before reading their old field values, then post-await computes
`next`, writes it back through the selected target, and returns `next` as the
assignment expression value. Rejected alternatives: reading the old value after
resume, widening into arbitrary assignment targets, thenable assimilation,
runtime task queues, or a general expression IR.

## Implementation

- `src/codegen.ts:222` adds identifier, class-field, and interface-field
  compound assignment leaf metadata alongside the existing array variant.
- `src/codegen.ts:6157` extends the awaited assignment-leaf builder to validate
  non-array compound targets through the ordinary assignment type rules.
- `src/codegen.ts:8706` removes the call-argument binary collector's array-only
  compound guard while preserving target-side await and safe-base checks.
- `src/codegen.ts:9315` stores old-value temps in the async frame before the RHS
  await runs: local binding, class field, interface getter, or array element.
- `src/codegen.ts:9458` materializes post-await `next` values, writes them back
  to the same selected target, and returns `next` to the surrounding binary.
- `examples/await_call_arg_assignment_non_array_compound.ts:40` covers local,
  class, and interface compound leaves in call-argument binaries.

## Consequences

- **Accepted**: narrow `x += await expr`, `obj.field += await expr`, and
  `iface.field += await expr` leaves, including the existing supported compound
  operators and typing behavior.
- **Preserved**: array-element compound leaves from 0619, source-order
  evaluation, pre-await old-value snapshots, and deferred diagnostics for
  target-side await, unsafe receivers, or wider await placement.
- **Regression**: `await_call_arg_assignment_non_array_compound` proves local
  acceptance, class/interface pre-await old-value timing, later call-argument
  ordering, and `next` flowing into the surrounding binary.
- **Regression count**: smoke now covers 694 `run_case` / `run_module_case` /
  `run_fail_case` entries.
