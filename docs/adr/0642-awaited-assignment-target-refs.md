# 0642 - Awaited assignment target refs

- **Status**: Accepted
- **Date**: 2026-07-19
- **Phase**: 5.175

## Context

[0615](./0615-awaited-assignment-call-leaves.md) through
[0620](./0620-awaited-non-array-compound-assignment-call-leaves.md) added
awaited assignment materialization for local identifiers, class fields,
interface fields, and array elements. Later snapshot leaves through
[0634](./0634-interface-assignment-value-snapshot-leaves.md) made the repeated
receiver, index, field, and type metadata across assignment leaf variants more
visible. Supporting side-effectful targets directly would mix a structural
refactor with new evaluation semantics.

## Decision

Introduce a minimal discriminated `AwaitTargetRef` descriptor whose four
variants own the existing safe target metadata and transformed target nodes.
Target recognition and temp declaration move into one helper; small switch
accessors expose receiver/index temps while preserving frame-store ordering.
`AwaitedAssignmentLeaf` keeps its existing materialization kinds but references
the descriptor instead of duplicating target fields.

Rejected alternatives: general side-effect capture would widen semantics; a
full async expression IR is disproportionate to assignment targets; retaining
parallel leaf fields keeps future target additions expensive; accepting unsafe
receivers or indices here would turn the refactor into a behavior change.

## Implementation

- `src/codegen.ts:193` defines self-host-compatible named target variants for
  identifier, class field, interface field, and array element refs.
- `src/codegen.ts:6174` recognizes only the existing safe target shapes and
  owns receiver/index temp metadata in the descriptor.
- `src/codegen.ts:6294` derives frame-facing temp lists and transformed target
  expressions with explicit discriminant switches.
- `src/codegen.ts:6350` keeps target-await, single-RHS-await, operator, and
  simple-replacement guards before building assignment leaves.
- `src/codegen.ts:6450` projects descriptor metadata into the unchanged async
  materialized-temp representation.

## Consequences

- **Preserved**: existing simple and compound awaited assignments for all four
  target shapes compile and run with unchanged async frame behavior.
- **Rejected**: unsafe interface receivers, unsafe array indices, prefix/postfix
  unsafe targets, multiple RHS awaits, and conditional/short-circuit lowering
  remain on their existing deferred diagnostics.
- **Regression count**: smoke covers 716 explicit `run_case` /
  `run_module_case` / `run_fail_case` entries; no new fixture was needed.
- **Scope**: side-effectful target decomposition, update expansion, general IR,
  scheduler/runtime work, and PromiseLike/thenable behavior remain deferred.
