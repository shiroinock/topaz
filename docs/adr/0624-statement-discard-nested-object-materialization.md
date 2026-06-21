# 0624 - Statement-discard nested-object materialization

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.157

## Context

[0590](./0590-contextual-object-nested-object-awaits.md) accepted nested object
values for contextual object literals, while [0621](./0621-statement-discard-mixed-pure-object-materialization.md),
[0622](./0622-statement-discard-shorthand-object-materialization.md), and
[0623](./0623-statement-discard-nested-array-object-materialization.md)
established the statement-discard ephemeral materialization descriptor. The
remaining narrow gap was a root statement-discard object literal whose root
`prop_kv` value is itself an object literal containing direct/simple awaited
properties, pure properties, shorthand properties, nested arrays, and further
nested object literals.

## Decision

Accept nested object-valued root `prop_kv` properties only inside the existing
statement-discard object materialization collector. The nested object literal
does not add an await step; direct/simple awaited nested properties become
ordinary suspension leaves, pure nested values remain in the transformed object,
and the final `emitWithExpected(...)` materializes the transformed root against
a recursively synthesized required-field anonymous-class target.

Rejected alternatives: standalone object literal inference would broaden the
language outside this explicit descriptor; pre-materializing nested objects
before awaits would add a second allocation boundary; accepting side-effectful
call snapshots, assignments, updates, `new`, spread, computed properties,
methods/getters/setters, ternary/logical/nullish trees, thenables, scheduler
changes, or general IR would exceed this syntax slice.

## Implementation

- `src/codegen.ts:8626` delegates root object-valued `prop_kv` values to the
  existing recursive object collector with pure leaves allowed and snapshots
  disabled, then appends the accepted awaited/pure event stream to the root
  statement-discard plan.
- `src/codegen.ts:8647` keeps descriptor construction rooted in the transformed
  statement-discard object literal, after await leaves have been replaced with
  temps.
- `src/codegen.ts:8655` builds required-field anonymous-class targets for each
  object literal level and preserves duplicate-property diagnostics locally at
  each level.
- `src/codegen.ts:8686` recurses only for object-valued descriptor fields;
  arrays, identifiers, scalars, and other accepted non-object leaves still use
  normal `inferType(...)`.
- `tests/smoke.sh:3104` promotes the former nested-object statement-discard
  fail fixture to a positive case.

## Consequences

- **Accepted**: `examples/await_object_literal_statement_nested_object_deferred_fail.ts`
  now proves source-order awaited nested-object leaves, a sync tail before
  resumption, shorthand and pure nested leaves, nested arrays, deeper nested
  objects, a pure root property, post-statement continuation, and `.then`.
- **Preserved**: side-effectful nested-object and nested-array fail fixtures
  remain rejected, as do fewer-than-two awaited leaves and standalone object
  literal inference outside the descriptor.
- **Rejected**: snapshotting side-effectful non-await nested values, object or
  array spread, computed properties, method/getter/setter syntax, thenable
  assimilation, and runtime scheduling changes.
- **Regression count**: smoke covers 697 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
