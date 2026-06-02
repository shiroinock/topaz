# 0051. Array predicate method cleanup (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0050](./0050-is-reference-type-non-null-removal.md) moved the full graph
self-host probe to `src/codegen.ts:154`, where compiler source still used
`Array.some`. Topaz currently supports selected Array higher-order methods, but
not `some` or `every`, and the remaining uses in `src/codegen.ts` were all
simple predicate scans.

## Decision

Rewrite all remaining `Array.some` and `Array.every` calls in `src/codegen.ts`
to explicit `for ... of` loops. This keeps the compiler source within the
current self-hosting subset without adding user-facing Array predicate
lowering.

Rejected alternatives: adding `Array.some` / `Array.every` lowering now would
expand the language surface and require callback/runtime coverage; rewriting
only the first failing `.some` would leave identical self-hosting blockers a few
lines later.

## Implementation

- `src/codegen.ts:154` rewrites `containsUndefined` to scan variants manually.
- `src/codegen.ts:173` rewrites `typesOverlap` union scans to loops.
- `src/codegen.ts:2799` rewrites class field-initializer completeness checking
  to a loop.
- `src/codegen.ts:6425` rewrites array-literal spread detection to a loop.
- `src/codegen.ts:9206` and `src/codegen.ts:9234` rewrite assignability
  predicate scans to loops.

## Consequences

- **Accepted**: compiler behavior is unchanged.
- **Rejected**: this does not add user-facing `Array.some` / `Array.every`
  support.
- **Regression**: no new example was added because emitted behavior is
  unchanged; existing smoke cases cover all touched helper paths.
- **Future direction**: Array predicate methods can be added later as a
  deliberate language feature with callback tests.
