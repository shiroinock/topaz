# 0625 - Statement-discard direct-object snapshot materialization

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.158

## Context

[0594](./0594-contextual-object-direct-snapshot-call-leaves.md) accepted direct
snapshot call leaves for contextual object literals. [0621](./0621-statement-discard-mixed-pure-object-materialization.md),
[0622](./0622-statement-discard-shorthand-object-materialization.md),
[0623](./0623-statement-discard-nested-array-object-materialization.md), and
[0624](./0624-statement-discard-nested-object-materialization.md) established
the explicit ephemeral materialization descriptor for statement-discard object
literals, but direct value-returning call leaves between awaited root
properties still forced the statement-discard plan back to deferred lowering.

## Decision

Accept conservative direct root `prop_kv` value-returning call leaves in a
statement-discard object literal by reusing the existing `AwaitSnapshotTemp`
event model. Snapshot calls before a later awaited property are evaluated as
pre-await stores on that later suspension step, restored during completion, and
replaced by temps in the transformed root object; calls after the final awaited
property stay in final ephemeral materialization order.

Rejected alternatives: recursive nested array/object side-effectful snapshots
remain out of scope; assignments, updates, `new`, optional calls, spread,
computed properties, methods/getters/setters, short-circuiting trees,
thenables, scheduler/runtime changes, and general IR remain deferred; pre-
materializing the whole object would add a second descriptor boundary.

## Implementation

- `src/codegen.ts:8641` records a direct root statement-discard `prop_kv`
  value that passes `isSnapshotMultiAwaitLeaf(...)` as a `snapshot` event after
  the nested array/object paths, while nested collectors continue to run with
  snapshots disabled.
- `src/codegen.ts:8542` already maps object snapshot events to frame-backed
  `AwaitSnapshotTemp` stores before the following awaited leaf and replaces the
  original call with a temp in the transformed object literal.
- `src/codegen.ts:8593` continues to synthesize the required-field anonymous
  class target from the transformed statement-discard object before final
  `emitWithExpected(...)` discards the materialized value.
- `tests/smoke.sh:3098` promotes the direct object side-effect fixture from a
  deferred fail to a positive source-order regression, and the older direct
  statement-discard fail fixture now records the narrower `middle` output.

## Consequences

- **Accepted**: `examples/await_object_literal_mixed_side_effect_deferred_fail.ts`
  now proves `left`, caller-side `sync tail`, pre-second-await snapshot
  `middle`, second await `right`, post-final-await materialization `tail`,
  `done`, and `.then` ordering.
- **Accepted**: `examples/await_object_literal_statement_deferred_fail.ts`
  is also a positive direct-root snapshot statement case with only the `middle`
  side effect observable.
- **Preserved**: nested array/object side-effectful snapshot fixtures remain
  rejected, as do fewer-than-two awaited leaves and standalone object literal
  inference outside the statement-discard descriptor.
- **Rejected**: assignments, updates, `new`, optional/spread calls, object or
  array spread, computed properties, method/getter/setter syntax, thenables,
  scheduler changes, and recursive snapshot expansion.
- **Regression count**: smoke covers 691 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
