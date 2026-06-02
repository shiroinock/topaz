# 0050. isReferenceType non-null removal (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0049](./0049-assignment-anchor-position-type.md) moved the full graph
self-host probe past the assignment-anchor union and exposed:
`src/codegen.ts:142:55: non-null assertion (\`!\`) requires a \`T | undefined\`
operand`.

The code was inside `isReferenceType`. It filtered `undefined` out of a union,
checked `nonUndef.length === 1`, and then read `nonUndef[0]!`. Topaz array
indexing already returns the element type directly, not `T | undefined`, so
the non-null assertion is unnecessary and correctly rejected by the current
subset.

## Decision

Store `nonUndef[0]` in a local inside the `length === 1` branch and recurse on
that local. This keeps the existing logic and avoids using `!` where the type is
already non-optional.

Rejected alternatives: changing array indexing to return `T | undefined` would
be a broad language/runtime decision; special-casing non-null assertions on
non-optional array reads would weaken an error that is currently correct.

## Implementation

- `src/codegen.ts:142` replaces `isReferenceType(nonUndef[0]!)` with a local
  `inner` read and `isReferenceType(inner)`.

## Consequences

- **Accepted**: `isReferenceType` behavior is unchanged.
- **Rejected**: array indexing semantics and non-null assertion rules are not
  changed.
- **Regression**: no new example was added because emitted user behavior is
  unchanged; the full graph self-host probe covers the source cleanup.
