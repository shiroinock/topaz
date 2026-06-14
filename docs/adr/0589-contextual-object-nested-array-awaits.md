# 0589 - Contextual object nested array awaits

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.122

## Context

[0586](./0586-mixed-pure-multi-await-array-literals.md) established the shared
array literal collector for direct awaited elements, nested arrays, and
conservative pure leaves. [0587](./0587-contextual-mixed-pure-multi-await-object-literals.md)
and [0588](./0588-contextual-object-shorthand-multi-await.md) then established
contextual object multi-await plans for declaration initializers and terminal
returns, while keeping statement-discard objects on the value-dropping boundary.

## Decision

Accept `prop_kv` values whose value is an array literal only when the object
literal collector is already running in a contextual pure-leaf position. The
object collector delegates that value to the existing multi-await array
collector, so direct/simple awaited array elements become ordinary suspension
leaves, conservative pure elements remain in the final object completion, and
nested arrays keep the already accepted array recursion policy. The array
literal itself does not add an extra await step.

Rejected alternatives: accepting nested arrays in expression-statement discard
would materialize work after the statement boundary has chosen to drop the
final object value; accepting nested object literals would combine object and
array recursion in one slice; treating array allocation as a generic pure leaf
would bypass the existing array await traversal and lose spread diagnostics;
accepting spread, side-effectful values, ternary, logical, nullish, or arbitrary
decomposition would need a broader snapshot policy.

## Implementation

- `src/codegen.ts:6797` keeps direct/simple awaited property values as the
  object collector's suspension leaves.
- `src/codegen.ts:6802` accepts array-literal property values only when
  `allowPureLeaves` is true and delegates to
  `collectMultiAwaitArrayLiteralLeaves(...)`.
- `src/codegen.ts:6765` remains the single array collector for nested arrays,
  direct awaited elements, pure leaves, and spread rejection.
- `examples/async_object_literal_nested_array_multiple_await.ts:13` proves an
  explicitly typed declaration initializer with an `Array<number>` field that
  contains two awaited elements and one pure element.
- `examples/async_object_literal_nested_array_multiple_await.ts:27` proves a
  terminal async return with the same contextual array-field shape.

## Consequences

- **Accepted**: contextual declaration initializers and terminal returns whose
  root object literal contains an array-literal property value with at least
  two direct awaited leaves plus conservative pure leaves.
- **Preserved**: source-order suspension, no extra array-allocation await step,
  final contextual object emission, shorthand and pure-field behavior from the
  prior phases, no runtime or Promise ABI change, and spread rejection through
  the shared array collector.
- **Rejected**: expression-statement discard with nested array property values,
  nested object literal property values, spread, side-effectful fields,
  ternary, logical/nullish short-circuiting, arbitrary decomposition, void
  awaited payloads, scheduler work, PromiseLike, and thenable assimilation.
- **Regression**: `async_object_literal_nested_array_multiple_await` proves the
  two accepted contextual positions; `await_object_literal_statement_nested_array_deferred_fail`
  preserves the existing deferred await lowering diagnostic for statement
  discard.
- **Regression count**: smoke covers 661 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
