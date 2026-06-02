# 0101. preallocated anon field anchors (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0100](./0100-fill-preallocated-anon-explicit-restore.md) moved the full graph
self-host probe to `src/codegen.ts:1767`, where `fillPreAllocatedAnonFields`
passed a `TypeLiteralNode` directly to `typeErr`. Topaz object matching is exact,
so a richer AST node shape is not assignable to the narrower diagnostic anchor
shape `{ pos: number }`.

## Decision

Use explicitly annotated `{ pos: number }` anchors for the preallocated literal
node and each member inside sub-pass B. Pass those anchors to `typeErr`,
`typeFromAnnotation`, and `assertNotVoid` instead of passing the AST node objects
directly.

Rejected alternative: broadening `typeErr` to accept all AST node variants would
make this compiler-source cleanup larger and would not address other helper
calls that intentionally use the narrow anchor shape.

## Implementation

- `src/codegen.ts:1766` creates a literal-node anchor before empty-object
  validation.
- `src/codegen.ts:1772` creates a per-member anchor for validation and
  diagnostics.

## Consequences

- **Accepted**: diagnostics keep the same source positions.
- **Accepted**: exact structural object matching no longer rejects these helper
  calls.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by the full graph probe.
