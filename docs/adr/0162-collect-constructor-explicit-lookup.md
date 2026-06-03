# 0162. collectConstructor explicit lookup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0161](./0161-class-field-initializer-local-narrowing.md) moved the full graph
self-host probe to `src/codegen.ts:3228`, where `collectConstructor` used
`if (info.ctor)` to detect a duplicate constructor. `info.ctor` is optional, and
Topaz conditions must be strict `boolean`. The duplicate-constructor diagnostic
also passed a full `ClassMethodMember` where the exact `{ pos: number }` anchor
shape is sufficient.

## Decision

Create an explicit `ctorAnchor`, copy `info.ctor` into `existingCtor`, check
`existingCtor !== undefined`, and use `ctorAnchor` for the duplicate
constructor diagnostic.

Rejected alternative: relying on truthy optional narrowing or wider anchor
compatibility would change language behavior rather than adapting compiler
source to the current subset.

## Implementation

- `src/codegen.ts:3228` creates `ctorAnchor`.
- `src/codegen.ts:3229` copies `info.ctor` into `existingCtor`.
- `src/codegen.ts:3230` checks `existingCtor !== undefined`.
- `src/codegen.ts:3231` reports duplicate constructors through `ctorAnchor`.

## Consequences

- **Accepted**: constructor collection uses explicit optional checks and
  explicit diagnostic anchors.
- **Rejected**: no truthy optional narrowing or structural anchor widening is
  added.
- **Regression**: no new example was added because this compiler-source cleanup
  is covered by the full graph self-host probe.
