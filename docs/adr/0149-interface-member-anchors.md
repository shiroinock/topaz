# 0149. interface member anchors (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0148](./0148-container-element-internal-error.md) moved the full graph
self-host probe to `src/codegen.ts:2949`, where interface member collection
passed full member objects to `CodegenError`. The diagnostic constructor only
requires `{ pos: number }`, and Topaz's exact object typing does not treat a
larger member shape as assignable to that minimal anchor.

The same member object is also used as the fallback anchor for nearby field and
method annotation checks.

## Decision

Create explicit `memberAnchor: { pos: number }` values in both interface member
branches and use them for diagnostics, annotation fallback anchors, and void
assertions in `collectInterfaceMembers`.

Rejected alternative: broadening `CodegenError` or annotation helpers to accept
full AST member objects would weaken the ongoing anchor normalization.

## Implementation

- `src/codegen.ts:2947` creates a field member anchor.
- `src/codegen.ts:2949` through `src/codegen.ts:2954` use the field anchor for
  duplicate, annotation, void, and fn-field diagnostics.
- `src/codegen.ts:2959` creates a method member anchor.
- `src/codegen.ts:2961` through `src/codegen.ts:2972` use the method anchor for
  duplicate, return annotation, parameter, and fn-return diagnostics.

## Consequences

- **Accepted**: interface member diagnostics use the same minimal anchor pattern
  as earlier declaration registration cleanup.
- **Rejected**: no diagnostic constructor widening or structural subtyping
  relaxation is introduced.
- **Regression**: no new example was added because this is a compiler-source
  cleanup exercised by the full graph probe.
