# 0621 - Statement-discard mixed-pure object materialization

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.154

## Context

[0584](./0584-expression-statement-multi-await-object-literals.md) accepted
statement-discard object literals only when every property value was a direct
`await`, because completion could run the awaits and intentionally skip a
standalone object value. [0591](./0591-statement-discard-object-materialization-boundary.md)
then required any mixed-pure expansion to name an ephemeral materialization
boundary instead of silently evaluating only fields.

## Decision

Accept the first statement-discard mixed-pure object slice: a paren-unwrapped
root object literal with at least two direct/simple awaited `prop_kv` values and
non-awaited `prop_kv` values accepted only by the existing conservative
side-effect-free leaf predicate. The final async-frame completion synthesizes a
required-field anonymous-class target from the transformed root properties,
emits the object literal against that target, stores it in a temporary, and
immediately discards it.

Rejected alternatives: broadening the generic object planner would hide
standalone object typing in `inferType`; evaluating only property expressions
would skip the object allocation boundary required by ADR 0591; accepting
shorthand, nested arrays/objects, side-effectful calls, assignment/update/new,
spread, computed keys, methods, ternary, logical/nullish short-circuiting,
thenables, or scheduler/runtime changes would exceed this narrow syntax slice.

## Implementation

- `src/codegen.ts:317` and `src/codegen.ts:351` add an optional
  `statementDiscardMaterializationType` descriptor to statement suspension
  steps and multi-await plans.
- `src/codegen.ts:5733` preserves the old all-direct-await statement-discard
  object path, then tries the new mixed-pure materialization path.
- `src/codegen.ts:8519` threads the optional materialization path through the
  object planner, `src/codegen.ts:8599` collects only root `prop_kv`
  statement-discard fields, and `src/codegen.ts:8619` synthesizes the
  anonymous-class target from the
  await-temp-transformed object literal.
- `src/codegen.ts:10130` emits the transformed object with `emitWithExpected`,
  assigns it into a temporary, and discards that temporary.

## Consequences

- **Accepted**: `examples/await_object_literal_statement_mixed_pure.ts` proves
  left-to-right awaits, a pure field left for final object materialization, and
  post-statement continuation.
- **Preserved**: all-direct-await statement discard still avoids object
  materialization; shorthand, nested array, and nested object statement-discard
  fail fixtures remain deferred.
- **Rejected**: standalone object literal inference, nested statement-discard
  object/array values, side-effectful mixed leaves, object spread/computed/
  method shorthand, thenable assimilation, and runtime task-queue work.
- **Regression count**: smoke covers 694 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
