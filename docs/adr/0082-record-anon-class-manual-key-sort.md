# 0082. recordAnonClass manual key sort (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0081](./0081-scope-lookup-cursor-locals.md) moved the full graph self-host
probe to `src/codegen.ts:1219`, where `recordAnonClass` used
`[...fields.keys()].sort()`. `fields.keys()` returns an iterator, while array
literal spread currently requires an `Array<T>`.

## Decision

Collect keys from `fields.keys()` with `for-of`, insert-sort them with the
existing ASCII `typeKeyLess` comparator, and build the canonical key, parameter
list, and ordered field map with explicit loops. Also replace local
`fields.get(f)!` reads with checked locals.

Rejected alternatives: adding iterator spread or relying on `Array.from` would
broaden runtime/library support for one compiler-internal canonicalization
path.

## Implementation

- `src/codegen.ts:1219` replaces iterator spread and `.sort()` with manual
  insertion sort.
- `src/codegen.ts:1228` builds the canonical key with an explicit loop.
- `src/codegen.ts:1241` builds params and ordered fields with checked field
  type reads.

## Consequences

- **Accepted**: anonymous class canonical field order and keys are unchanged.
- **Rejected**: no iterator spread support is added.
- **Regression**: no new example was added because existing type-literal and
  object-literal tests cover this behavior, and the full graph self-host probe
  covers this compiler-source cleanup.
