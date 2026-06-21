# 0626 - Statement-discard nested-array snapshot materialization

- **Status**: Accepted
- **Date**: 2026-06-21
- **Phase**: 5.159

## Context

[0593](./0593-side-effectful-array-await-snapshots.md) accepted snapshot call
leaves inside array literal await plans, while
[0623](./0623-statement-discard-nested-array-object-materialization.md) let a
statement-discard root object materialize array-valued direct properties with
snapshots disabled. [0625](./0625-statement-discard-direct-object-snapshot-materialization.md)
then added direct root object snapshot calls, leaving the next narrow gap:
side-effectful value-returning calls inside array-valued root `prop_kv`
properties still forced the statement-discard object plan back to deferred
lowering.

## Decision

Accept array literal root `prop_kv` values in statement-discard objects with
the existing `AwaitSnapshotTemp` event model enabled. Snapshot calls inside
that array, including nested arrays under the same array collector, are appended
to the root statement-discard object plan; snapshots before a later awaited
leaf become frame-backed pre-await stores, while snapshots after the final
await remain in final ephemeral materialization order.

Rejected alternatives: nested object-valued property snapshots stay out of
scope; assignments, updates, `new`, optional/spread calls, array/object spread,
computed properties, method/getter/setter syntax, short-circuiting expression
trees, thenables, scheduler/runtime work, and general IR remain deferred; pre-
materializing nested arrays before awaits would add a second descriptor
boundary instead of reusing the explicit ephemeral materialization descriptor.

## Implementation

- `src/codegen.ts:8618` delegates statement-discard array-valued root
  properties to `collectMultiAwaitArrayLiteralLeaves(...)` with snapshots
  enabled, so returned `snapshot` events join the root object event stream.
- `src/codegen.ts:8542` continues to lower object snapshot events into
  `AwaitSnapshotTemp` stores before the following awaited leaf and replaces the
  exact original expression in the transformed object/array tree.
- `src/codegen.ts:8630` keeps object-valued property recursion on the
  snapshots-disabled path, preserving the nested object side-effect boundary.
- `src/codegen.ts:8667` still synthesizes the required-field anonymous class
  target from the transformed object, after snapshot calls inside array values
  have been replaced by temps.

## Consequences

- **Accepted**: `examples/await_object_literal_nested_array_side_effect_deferred_fail.ts`
  now proves `left`, caller-side `sync tail`, pre-second-await snapshot
  `middle`, second await `right`, final-materialization `tail`, `done`, and
  `.then` ordering.
- **Preserved**: `await_object_literal_nested_object_side_effect_deferred_fail`
  remains rejected, along with fewer-than-two awaited leaves and standalone
  object literal inference outside the statement-discard descriptor.
- **Rejected**: assignment/update/new leaves, optional calls, spread forms,
  computed properties, method/getter/setter syntax, short-circuiting trees,
  thenables, scheduler/runtime work, and recursive nested object snapshots.
- **Regression count**: smoke covers 691 explicit
  `run_case` / `run_module_case` / `run_fail_case` entries.
