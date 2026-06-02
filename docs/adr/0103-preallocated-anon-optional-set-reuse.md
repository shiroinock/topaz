# 0103. preallocated anon optional set reuse (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0102](./0102-preallocated-anon-manual-field-sort.md) moved the full graph
self-host probe to `src/codegen.ts:1815`, where `fillPreAllocatedAnonFields`
copied a local set with `new Set(optionalFields)`. Topaz currently supports
`Set<T>` construction without iterable arguments, but not iterable-copy
construction.

## Decision

Reuse the local `optionalFields` set directly by assigning it to
`cls.optionalFields`. The set is created inside the current preallocated-anon
loop iteration and is not retained elsewhere, so the copy does not protect any
observable ownership boundary.

Rejected alternative: adding iterable `Set` constructor support is general
runtime/lowering work and unnecessary for this compiler-source cleanup.

## Implementation

- `src/codegen.ts:1815` assigns `optionalFields` directly instead of constructing
  a copy.

## Consequences

- **Accepted**: `ClassInfo.optionalFields` receives the same contents.
- **Accepted**: no iterable `Set` constructor support is added.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by existing recursive alias tests and the full
  graph probe.
