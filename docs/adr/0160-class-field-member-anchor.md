# 0160. class field member anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0159](./0159-class-implements-explicit-lookup.md) moved the full graph
self-host probe to `src/codegen.ts:3201`, where `collectField` passed the full
`ClassFieldMember` into `CodegenError`. `CodegenError`, `typeFromAnnotation`,
and `assertNotVoid` accept the exact anchor shape `{ pos: number }`; Topaz exact
object matching rejects the wider class-field member shape.

## Decision

Create a single explicitly annotated `{ pos: number }` anchor from `m.pos` in
`collectField`, and use it for the field redeclaration diagnostics, type
annotation lookup, `void` rejection, and fn-field rejection.

Rejected alternative: widening anchor compatibility to allow arbitrary objects
with a `pos` field would change structural matching semantics and is unnecessary
for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:3199` creates `fieldAnchor`.
- `src/codegen.ts:3202` and `src/codegen.ts:3205` pass `fieldAnchor` to
  `CodegenError`.
- `src/codegen.ts:3212` passes `fieldAnchor` to `typeFromAnnotation`.
- `src/codegen.ts:3213` and `src/codegen.ts:3215` reuse `fieldAnchor` for type
  diagnostics.

## Consequences

- **Accepted**: class field collection follows the same explicit-anchor pattern
  used by interface member collection and registration passes.
- **Rejected**: exact object matching and anchor contracts remain unchanged.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
