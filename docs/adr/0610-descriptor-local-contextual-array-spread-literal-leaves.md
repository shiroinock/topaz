# 0610 - Descriptor-local contextual array-spread literal leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.143

## Context

[0609](./0609-descriptor-local-contextual-literal-tree-call-leaves.md)
generalized the descriptor-local contextual object walker to object/array
literal trees, but still rejected every array spread element before looking at
the spread source. The next pinned fail was narrower than general spread
lowering: a nested descriptor-backed call argument had a contextual object
literal, an array property used `...[literal]`, and that literal subtree
contained an awaited descriptor-backed call leaf.

## Decision

Allow the descriptor-local literal-tree walker to recurse into array spread
sources only when the unwrapped source expression is an object or array literal.
The walker still enters only from the nested descriptor-backed call argument
whose argument is a contextual object literal, plans only awaited
descriptor-backed `call_expr` leaves, and replaces exact leaves with child
nested-call result temps in the owning transformed argument tree. Rejected
alternatives remain standalone literal temps, ephemeral descriptors, a general
expression-decomposition IR, scheduler/runtime changes, and arbitrary
non-literal spread sources.

## Implementation

- `src/codegen.ts:6494` keeps normal array elements on the existing child list
  and unwraps array spread sources before deciding whether to recurse.
- `src/codegen.ts:6498` returns `undefined` for non-literal spread sources, so
  spread calls, identifiers, and other expressions with awaits continue through
  the existing deferred await diagnostic.
- `src/codegen.ts:6501` pushes only literal spread sources into the existing
  source-order walk, preserving final materialization by ordinary contextual
  object/array emission and synchronous array-spread copy.
- `tests/smoke.sh:3095` converts the literal spread scenario to a positive
  regression, and `tests/smoke.sh:3120` pins non-literal spread sources as the
  remaining deferred frontier.

## Consequences

- **Accepted**: nested descriptor-backed call arguments whose contextual object
  literal contains an array spread of an object/array literal subtree with an
  awaited descriptor-backed call leaf.
- **Preserved**: Phase 5.142 non-spread object/array literal tree positives keep
  using the same descriptor-local walker and transformed-expression replacement
  path.
- **Rejected**: arbitrary spread sources that contain awaits still report
  `await expression lowering is deferred`.
- **Regression**:
  `async_call_arg_contextual_object_array_spread_snapshot_leaf_descriptor_await`
  proves source-order materialization through a literal array spread source with
  deterministic result `1126`.
- **Regression**:
  `await_call_arg_nested_snapshot_array_spread_nonliteral_deferred_fail` keeps
  call-result spread sources deferred.
- **Regression count**: smoke covers 685 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
