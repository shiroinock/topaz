# 0588 - Contextual object shorthand multi-await leaves

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.121

## Context

[0009](./0009-object-literal-shorthand.md) established ordinary object literal
property shorthand as `{ x }` lowering through the same contextual object
emission path as `{ x: x }`. [0587](./0587-contextual-mixed-pure-multi-await-object-literals.md)
then accepted mixed direct-await and pure non-await property values for
contextual declaration initializers and terminal returns, but left shorthand as
deferred even though it is only an identifier read in those final object
emission positions.

## Decision

Accept `prop_shorthand` as a pure identifier leaf only when the object literal
multi-await collector is already running with contextual pure leaves enabled.
The shorthand property contributes no await step, is not frame-temp captured,
and remains in the transformed object literal so final contextual emission reads
the identifier through the existing `{ x }` -> `{ x: x }` semantics.

Rejected alternatives: desugaring shorthand into `prop_kv` before planning would
duplicate the AST normalization that ordinary object emission intentionally
avoids; accepting shorthand in expression-statement discard would reopen the
value-materialization boundary that still drops final object values; accepting
spread, method shorthand, getter/setter, nested literals, or arbitrary
decomposition would need snapshot, object-shape, or branch-sensitive scheduler
work outside this syntax-coverage slice.

## Implementation

- `src/codegen.ts:6791` lets `collectMultiAwaitObjectLiteralProperties(...)`
  accept `prop_shorthand` only when `allowPureLeaves` is true.
- `src/codegen.ts:6792` keeps statement-discard object literals unchanged by
  returning deferred lowering when shorthand appears with pure leaves disabled.
- `src/codegen.ts:7137` already preserves shorthand while replacing awaited
  property values, so no replacement or desugaring change is needed.
- `examples/async_object_literal_shorthand_multiple_await.ts:13` proves an
  explicitly typed declaration initializer with two awaited `prop_kv` values
  and one shorthand leaf.
- `examples/async_object_literal_shorthand_multiple_await.ts:26` proves a
  terminal async return object with two awaited `prop_kv` values and one
  shorthand leaf.

## Consequences

- **Accepted**: contextual declaration initializers and terminal returns whose
  root object literal mixes direct awaited `prop_kv` values with shorthand
  identifier leaves.
- **Preserved**: source-order suspension, pure-leaf final evaluation, no
  shorthand temp capture, no Promise ABI or scheduler change, and the minimum of
  at least two awaited leaves for multi-await planning.
- **Rejected**: expression-statement discard with shorthand, spread, method
  shorthand, getter/setter, side-effectful fields, nested object/array literals,
  ternary, logical/nullish short-circuiting, arbitrary decomposition, and nested
  await outside direct awaited property values.
- **Regression**: `async_object_literal_shorthand_multiple_await` proves the
  accepted contextual shapes; `await_object_literal_statement_shorthand_deferred_fail`
  preserves the existing deferred await lowering diagnostic for statement
  discard.
- **Regression count**: smoke covers 662 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
