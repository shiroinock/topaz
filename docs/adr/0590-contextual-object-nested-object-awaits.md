# 0590 - Contextual object nested object awaits

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.123

## Context

[0587](./0587-contextual-mixed-pure-multi-await-object-literals.md) accepted
contextual object literal plans with direct awaited and conservative pure
property values. [0588](./0588-contextual-object-shorthand-multi-await.md)
added shorthand identifier leaves, and
[0589](./0589-contextual-object-nested-array-awaits.md) added nested array
property values through the shared array collector. Ordinary object literal
lowering already supports nested anonymous-class fields through final
`emitWithExpected(value, fieldType)` calls, but the async collector could not
yet find awaited leaves inside nested object property values.

## Decision

Accept nested object literal `prop_kv` values only when the root object literal
planner is already running in a contextual pure-leaf position: declaration
initializers with an explicit object target and terminal async returns with a
Promise payload object target. The nested object literal recurses through the
same object collector, so direct/simple awaited property values become ordered
suspension leaves while shorthand, conservative pure values, and nested array
values remain for final contextual object emission.

Rejected alternatives: accepting nested objects in expression-statement discard
would materialize work after that boundary has chosen to drop the final object
value; treating object allocation as a generic pure leaf would skip recursive
await discovery and contextual typing; combining spread, side-effectful fields,
ternary/logical/nullish short-circuiting, or arbitrary decomposition would need
a broader snapshot policy.

## Implementation

- `src/codegen.ts:6784` keeps the public object collector as the planner entry
  point and still lets the final `awaits.length < 2` check decide whether a
  multi-await plan exists.
- `src/codegen.ts:6792` moves object property traversal into a recursive helper
  that rejects empty object literals but no longer requires two root
  properties.
- `src/codegen.ts:6811` delegates nested array property values to the existing
  array collector only when contextual pure leaves are enabled.
- `src/codegen.ts:6815` accepts nested object property values only when
  contextual pure leaves are enabled and recurses without adding an object
  allocation suspension step.
- `examples/async_object_literal_nested_object_multiple_await.ts:11` proves an
  explicitly typed declaration initializer whose single root field contains a
  nested object with two awaited values and one shorthand leaf.
- `examples/async_object_literal_nested_object_multiple_await.ts:26` proves a
  terminal async return with the same nested object shape.

## Consequences

- **Accepted**: contextual declaration initializers and terminal returns whose
  object property values contain nested object literals with at least two
  direct/simple awaited leaves plus shorthand, conservative pure, or nested
  array leaves.
- **Preserved**: source-order suspension, final contextual object emission, no
  object-allocation await step, expression-statement discard behavior, and no
  scheduler/runtime or Promise ABI change.
- **Rejected**: statement-discard nested object values, empty nested object
  collector roots, spread, method shorthand, getter/setter, side-effectful
  fields, ternary, logical/nullish short-circuiting, arbitrary decomposition,
  void awaited payloads, PromiseLike, and thenable assimilation.
- **Regression**: `async_object_literal_nested_object_multiple_await` proves the
  two contextual accepted positions; `await_object_literal_statement_nested_object_deferred_fail`
  preserves the existing deferred await lowering diagnostic for statement
  discard.
- **Regression count**: smoke covers 662 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
