# 0644 - Shared assignment target refs for property receivers

- **Status**: Accepted
- **Date**: 2026-07-19
- **Phase**: 5.177

## Context

[0642](./0642-awaited-assignment-target-refs.md) introduced the async-only
`AwaitTargetRef` shape for safe identifier, class-field, interface-field, and
array-element targets. [0643](./0643-multi-await-assignment-rhs-leaves.md)
then proved final assignment materialization after multiple RHS awaits. The
next side-effectful target step should reuse that structure instead of adding
another async-only property-assignment branch.

## Decision

Rename the family to `AssignmentTargetRef` and mark class/interface refs whose
await-free call receiver must be materialized before the first RHS await. Such
refs validate the concrete field through the captured receiver target, capture
a compound old value from that receiver before suspension, and perform one
final field write after the last RHS await. A narrow outer binary planner also
composes one direct left await with the existing multi-await assignment plan.

Rejected alternatives: globally loosening synchronous `checkAssignTarget`
would widen unrelated assignment/update semantics; allowing arbitrary receiver
decomposition or `new` leaves would require a broader expression plan; array
receiver/index decomposition needs a later descriptor extension; runtime,
scheduler, PromiseLike, and thenable changes are unrelated.

## Implementation

- `src/codegen.ts:193` defines the shared descriptor family and records whether
  a class/interface receiver is materialized.
- `src/codegen.ts:6110` routes side-effectful property compound statements
  through assignment materialization so receiver and old value precede await.
- `src/codegen.ts:6252` accepts only non-optional, await-free call receivers
  resolving to existing concrete class or interface fields.
- `src/codegen.ts:8505` snapshots multi-await compound old values through the
  captured receiver and preserves final assignment-expression values.
- `src/codegen.ts:8632` composes the accepted direct-left-await plus
  multi-await property-assignment expression without a general expression IR.

## Consequences

- **Accepted**: class and interface call receivers are evaluated once before
  RHS awaits in supported compound statements and multi-await expressions.
- **Ordering**: compound old values precede RHS side effects; the final write
  happens once after the final await and yields the assigned next value.
- **Preserved**: safe identifier, class/interface field, and array-element
  assignment behavior is unchanged; synchronous lowering is not widened.
- **Rejected**: effectful array receivers/indices, target-side await, optional
  targets, short-circuit/conditional RHS, non-field targets, `new`, and
  arbitrary receiver decomposition remain deferred.
- **Regressions**: three ordering positives and two property-target failures
  bring smoke coverage to 721 explicit cases.
