# 0587 - Contextual mixed-pure multi-await object literals

- **Status**: Accepted
- **Date**: 2026-06-14
- **Phase**: 5.120

## Context

[5.113](./0580-multi-await-object-literals.md) established contextual object
literal multi-await lowering for declaration initializers and terminal returns,
and [5.117](./0584-expression-statement-multi-await-object-literals.md) added
the all-direct-await statement discard form. [5.118](./0585-mixed-pure-multi-await-binary-trees.md)
and [5.119](./0586-mixed-pure-multi-await-array-literals.md) then established a
shared conservative pure-leaf policy. Contextually typed object literals can use
that policy because the transformed object is still emitted and checked against
the existing anonymous-class / dunion target.

## Decision

Accept mixed-pure object property values only for contextual initializer and
terminal-return positions. The object collector now accepts `prop_kv` values
that are either direct/simple `await` leaves or conservative side-effect-free
non-await leaves from the shared pure-leaf predicate. Awaited leaves become
frame temps in source order; pure leaves are not temp-captured and stay in the
transformed object literal for final contextual emission.

Rejected alternatives: accepting mixed-pure expression-statement discard now
would skip pure-field evaluation because statement completion intentionally
drops the final object value; accepting arbitrary calls, method calls,
constructors, element access, assignment, update, or `new` would need a
side-effect snapshot policy; accepting spread would need snapshot semantics;
shorthand, nested object/array literals, ternary, `&&`, `||`, and `??` each need
separate diagnostics or branch-sensitive continuation design.

## Implementation

- `src/codegen.ts:5365` enables pure object leaves for annotated declaration
  initializers only after an expected object type is available.
- `src/codegen.ts:5540` keeps expression-statement discard object literals on
  the all-direct-await path by disabling pure leaves there.
- `src/codegen.ts:5664` enables pure object leaves for terminal returns, where
  the async payload type supplies contextual object typing.
- `src/codegen.ts:6724` threads the pure-leaf policy into the object literal
  planner without changing temp replacement or suspension ordering.
- `src/codegen.ts:6798` accepts non-await object property values only when the
  caller allows pure leaves and `isSideEffectFreeMultiAwaitLeaf` approves them.
- `examples/async_object_literal_mixed_pure_multiple_await.ts:18` proves
  initializer and terminal-return objects with identifier, non-short-circuit
  binary, and non-optional property pure leaves.

## Consequences

- **Accepted**: contextual declaration initializers and terminal returns whose
  root object literal mixes direct awaited property values with conservative
  pure non-await leaves.
- **Preserved**: source-order suspension, FIFO continuation behavior, no pure
  leaf temp capture, no runtime or Promise ABI changes, and the minimum of at
  least two awaited leaves for multi-await planning.
- **Rejected**: mixed-pure expression-statement discard objects, side-effectful
  fields, spread, shorthand, nested object/array values, ternary,
  logical/nullish short-circuiting, nested await outside direct await values,
  void awaited payloads, scheduler work, PromiseLike, and thenable assimilation.
- **Regression**: `async_object_literal_mixed_pure_multiple_await` proves the
  accepted contextual shape; `await_object_literal_mixed_side_effect_deferred_fail`
  and `await_object_literal_statement_mixed_pure_deferred_fail` preserve the
  existing deferred await lowering diagnostic at both boundaries.
- **Regression count**: smoke covers 657 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
