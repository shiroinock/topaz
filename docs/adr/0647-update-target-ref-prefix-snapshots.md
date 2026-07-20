# 0647 — Update target refs for prefix snapshots

- **Status**: Accepted
- **Date**: 2026-07-20
- **Phase**: 5.180

## Context

[0635](./0635-prefix-update-snapshot-leaves.md) accepted prefix update
snapshots but kept their target validation on the older safe-target predicates.
[0646](./0646-snapshot-assignment-target-descriptors.md) moved assignment
snapshots to `AssignmentTargetRef` while deliberately leaving update old/new
value semantics for a separate decision. Prefix snapshots therefore still
could not materialize await-free call receivers or array indices.

## Decision

Introduce an update-owned `UpdateTargetRef` family for identifier, class field,
interface field, and array element targets. Connect only prefix `++` and `--`
snapshot leaves to it. The descriptor captures receiver then array index before
the next suspension, and the prefix store snapshots the updated value through
those captures without replaying either target side.

Rejected alternatives: reusing `AssignmentTargetRef` as the public update
descriptor would obscure the distinct postfix old-result/new-target model;
landing postfix in the same phase would require that additional frame state;
and a general decomposition IR, runtime helper, or scheduler change would
broaden this lowering-only slice.

## Implementation

- `src/codegen.ts:168-283` adds update metadata to snapshot temps and defines
  the four explicit `UpdateTargetRef` variants.
- `src/codegen.ts:6482-6636` projects the shared target validation into an
  update-owned descriptor, validates transformed prefix expressions, and
  appends descriptor receiver/index captures to every snapshot planner.
- `src/codegen.ts:9646-9663` probes prefix snapshots through the update
  descriptor while leaving the postfix safe-target predicates unchanged.
- `src/codegen.ts:10245-10346` reads and writes class/interface/array targets
  through frame captures and stores the new prefix value as the snapshot.

## Consequences

- **Accepted**: prefix updates on class/interface fields with safe or await-free
  call receivers, and array elements with safe or await-free call receiver/index.
- **Ordering**: receiver, array index, update read/write, and snapshot result
  each occur once before the following await; resume does not replay the target.
- **Rejected**: target-side await, optional/conditional or unsafe non-call
  target expressions, and call-shaped postfix targets remain deferred.
- **Regression**: `await_snapshot_prefix_update_target_descriptors` covers
  source order, single evaluation, `++`, and `--`; three focused failures keep
  the target boundary closed, while two former prefix failures are promoted.
  Smoke coverage is 734 cases.
- **Scope**: postfix result/target frame state, general IR, runtime, scheduler,
  PromiseLike/thenable behavior, loader, and CLI remain unchanged.
