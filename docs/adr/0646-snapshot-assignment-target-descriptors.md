# 0646 — Snapshot assignment target descriptors

- **Status**: Accepted
- **Date**: 2026-07-20
- **Phase**: 5.179

## Context

[0644](./0644-shared-assignment-target-refs-property-receivers.md) and
[0645](./0645-materialized-array-element-assignment-targets.md) made
`AssignmentTargetRef` the shared descriptor for awaited assignment targets.
Assignment-expression snapshot leaves still used separate safe-target
predicates and emitted their original expression, so await-free call receivers
and array indices remained deferred before a later await.

## Decision

Route assignment-expression snapshot leaves through `AssignmentTargetRef`.
Build descriptor-owned receiver and index captures before the next suspension,
then execute the assignment once while storing its result in the snapshot temp.
Simple and supported compound assignments share this path; compound lowering
reads the old value after receiver/index capture and before evaluating the RHS.

Rejected alternatives: descriptorizing prefix/postfix updates would mix their
distinct old/new result rules into this slice; a separate snapshot-target IR
would duplicate the existing descriptor; and loosening synchronous assignment
or accepting target-side await, optional, or arbitrary targets would broaden
the language boundary beyond this phase.

## Implementation

- `src/codegen.ts:6263-6477` allows descriptor probing without scope mutation,
  builds validated snapshot descriptors, and projects their capture temps.
- `src/codegen.ts:8181-9139` attaches descriptor receiver/index captures across
  binary, call-argument, assignment-RHS, and literal snapshot planners.
- `src/codegen.ts:9486-9511` replaces assignment-specific safe-target checks
  with descriptor-backed snapshot acceptance while leaving updates unchanged.
- `src/codegen.ts:10100-10198` performs descriptor-backed simple/compound
  assignment stores before suspension and resumes from the snapshot value.

## Consequences

- **Accepted**: class/interface field assignment with safe or await-free call
  receivers, and array assignment with safe or await-free call receiver/index.
- **Ordering**: receiver, index, compound old value, RHS, and write/result each
  occur once before the next await; resume does not replay the target or write.
- **Rejected**: target-side await, optional and conditional targets, prefix and
  postfix update widening, and arbitrary expression decomposition remain closed.
- **Regression**: `await_snapshot_assignment_target_descriptors` covers simple
  class/interface/array and compound array ordering; three adjacent failures
  plus one promoted interface fixture bring smoke coverage to 730 cases.
- **Scope**: runtime, scheduler, PromiseLike/thenable behavior, loader, CLI, and
  synchronous assignment acceptance are unchanged.
