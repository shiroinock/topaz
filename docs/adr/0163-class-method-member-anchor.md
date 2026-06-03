# 0163. class method member anchor (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0162](./0162-collect-constructor-explicit-lookup.md) moved the full graph
self-host probe to `src/codegen.ts:3242`, where `collectMethod` passed the full
`ClassMethodMember` into `CodegenError`. The function also passed the full member
as the method return type annotation anchor. Topaz exact object matching rejects
the wider method-member shape where the exact `{ pos: number }` anchor is
expected.

## Decision

Create a single explicitly annotated method anchor from `m.pos` and use it for
method redeclaration diagnostics, field/method collision diagnostics, and return
type annotation handling.

Rejected alternative: broadening anchor compatibility would change exact object
matching and duplicate earlier anchor-cleanup decisions.

## Implementation

- `src/codegen.ts:3240` creates `methodAnchor`.
- `src/codegen.ts:3243` and `src/codegen.ts:3246` pass `methodAnchor` to
  `CodegenError`.
- `src/codegen.ts:3249` passes `methodAnchor` to `typeFromAnnotation`.

## Consequences

- **Accepted**: class method collection follows the explicit-anchor pattern used
  by interface members, class fields, and constructor collection.
- **Rejected**: exact object matching and anchor contracts remain unchanged.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
