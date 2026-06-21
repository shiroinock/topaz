# 0622 - Statement-discard shorthand object materialization

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.155

## Context

[0588](./0588-contextual-object-shorthand-multi-await.md) accepted object
literal shorthand as a pure identifier leaf for contextual multi-await object
literals, but kept statement-discard shorthand deferred while [0591](./0591-statement-discard-object-materialization-boundary.md)
held the discarded object value boundary closed. [0621](./0621-statement-discard-mixed-pure-object-materialization.md)
then introduced an explicit ephemeral materialization descriptor for mixed-pure
statement-discard object literals, so shorthand can now use that boundary
without treating the final object value as silently optional.

## Decision

Accept root `prop_shorthand` members as pure identifier leaves only in the
statement-discard object materialization path. The shorthand property adds no
await step, is not captured into a pre-await temporary, remains in the
transformed object literal, and contributes a required anonymous-class field
whose type is inferred from the equivalent identifier read used by final
`emitWithExpected(...)` materialization.

Rejected alternatives: globally desugaring shorthand to `prop_kv` would
duplicate ordinary object emission semantics; snapshotting shorthand before the
first await would contradict ADR 0588's pure-leaf model; accepting nested
objects/arrays, spread, computed keys, method/getter/setter syntax,
side-effectful non-await leaves, thenables, or scheduler/runtime changes would
exceed this narrow statement-discard slice.

## Implementation

- `src/codegen.ts:8599` now lets
  `collectStatementDiscardObjectLiteralProperties(...)` record root shorthand
  properties as pure identifier leaves while preserving the existing direct
  awaited `prop_kv` and conservative non-await `prop_kv` checks.
- `src/codegen.ts:8623` now lets
  `synthesizeStatementDiscardObjectMaterializationType(...)` infer shorthand
  field types from equivalent identifier reads and report duplicate properties
  across `prop_kv` and shorthand members.
- `src/codegen.ts:10142` continues to emit the transformed object through
  `emitWithExpected(...)`, so ordinary `{ x }` emission performs the final
  identifier read at ephemeral materialization time.

## Consequences

- **Accepted**: `examples/await_object_literal_statement_shorthand_deferred_fail.ts`
  now proves root statement-discard object shorthand with two direct awaited
  properties, source-order resumption, post-statement continuation, and `.then`.
- **Preserved**: nested array and nested object statement-discard fixtures
  remain deferred, and all-direct-await statement discard still avoids object
  materialization.
- **Rejected**: standalone object literal inference outside the descriptor,
  fewer than two awaited leaves, nested statement-discard literals,
  side-effectful mixed leaves, object spread/computed/method syntax, thenable
  assimilation, and runtime task-queue changes.
- **Regression count**: smoke covers 691 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
