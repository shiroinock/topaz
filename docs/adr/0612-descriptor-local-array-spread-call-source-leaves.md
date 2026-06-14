# 0612 - Descriptor-local array-spread call source leaves

- **Status**: Accepted
- **Date**: 2026-06-15
- **Phase**: 5.145

## Context

[0610](./0610-descriptor-local-contextual-array-spread-literal-leaves.md)
allowed descriptor-local literal recursion inside array spread sources, and
[0611](./0611-array-literal-spread-evaluation-plan.md) introduced the
synchronous array-spread plan boundary. The remaining pinned frontier was
narrower than arbitrary awaited spread-source decomposition: inside a nested
descriptor-backed call argument, a contextual object literal contains an array
property whose spread source is itself a descriptor-backed `call_expr` with an
awaited argument.

## Decision

Extend only the descriptor-local literal-tree walker so array spread sources may
enter the existing awaited descriptor-backed call leaf planner when the
unwrapped spread source is a `call_expr`. Object and array literal spread
sources continue to recurse as in phase 5.143, and final spread emission remains
the synchronous `emitArrayLiteral` / `buildArrayLiteralSpreadPlan` boundary after
the call-valued spread source has been replaced by the child nested-call result
temp. Rejected alternatives: a general expression-decomposition IR, synthetic
spread descriptors, interleaved async-aware array spread emission, or accepting
non-call expressions such as identifiers, property access, conditionals, and
arbitrary call chains with awaits.

## Implementation

- `src/codegen.ts:6504` keeps fixed array elements on the existing child walk
  and unwraps spread sources before classification.
- `src/codegen.ts:6509` now treats `call_expr` spread sources as literal-tree
  children, letting the later call-leaf branch reuse
  `tryPlanNestedMultiAwaitObjectCallLeaf`.
- `src/codegen.ts:6525` still performs the exact-expression replacement with
  the child nested-call result temp, so ordinary contextual array emission sees
  an identifier spread source.
- `tests/smoke.sh:3096` adds the call-valued spread source positive, and
  `tests/smoke.sh:3121` keeps a conditional spread source deferred.

## Consequences

- **Accepted**: nested descriptor-backed call arguments whose contextual object
  literal contains `...[items(await Promise.resolve(...))]` in an array property.
- **Preserved**: literal spread sources still recurse through the phase 5.143
  path, and synchronous array-spread source type diagnostics remain owned by the
  phase 5.144 plan builder.
- **Rejected**: non-call arbitrary spread sources with awaits, including
  conditionals, still report `await expression lowering is deferred`.
- **Regression**:
  `await_call_arg_nested_snapshot_array_spread_call_source_leaf` proves child
  call materialization runs before the owning `readBox` call and stays ordered
  between surrounding awaited call arguments.
- **Regression**:
  `await_call_arg_nested_snapshot_array_spread_conditional_source_deferred_fail`
  pins the deferred non-call frontier.
- **Regression count**: smoke covers 684 `run_case` / `run_module_case` /
  `run_fail_case` entries.
