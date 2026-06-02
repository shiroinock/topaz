# 0102. preallocated anon manual field sort (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0101](./0101-preallocated-anon-field-anchors.md) moved the full graph
self-host probe to `src/codegen.ts:1787`, where `fillPreAllocatedAnonFields`
used `[...fields.keys()].sort()`. `Map.keys()` returns an iterator in Topaz, and
array spread currently accepts only `Array<T>`.

## Decision

Use the same insertion-sort pattern as `recordAnonClass`: push each field name
into an `Array<string>`, move it into sorted position with `typeKeyLess`, then
build ordered fields and constructor params by explicitly narrowing each
`Map.get` result.

Rejected alternative: adding iterator spread or `Array.prototype.sort` support is
general language/runtime work and unnecessary for this compiler-internal
canonicalization path.

## Implementation

- `src/codegen.ts:1787` replaces iterator spread plus `.sort()` with manual
  insertion sort.
- `src/codegen.ts:1790` replaces `sorted.map(...)` and non-null assertions with
  an explicit loop and `Map.get` narrowing.

## Consequences

- **Accepted**: preallocated anon field order stays canonical and matches
  `recordAnonClass`.
- **Rejected**: no iterator spread or array sort support is added.
- **Regression**: no new example was added because this is a compiler-source
  self-hosting cleanup covered by existing recursive alias tests and the full
  graph probe.
