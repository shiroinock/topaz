# 0054. makeUnion manual sort (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-02
- **Phase**: 1.5-6i prep

## Context

[0053](./0053-type-eq-indexed-non-null-cleanup.md) moved the full graph
self-host probe to `src/codegen.ts:324`, where `makeUnion` used
`Array.from(dedup.values()).sort(...)`. Topaz does not currently expose
`Array` as a runtime value, and this helper only needs deterministic canonical
ordering for union variants.

## Decision

Collect deduplicated variants with a `for-of` over `Map.values()` and maintain
the type-key order with manual insertion sort. The ordering uses a byte-wise
`typeKeyLess` helper rather than string relational operators. This keeps
canonical union ordering while avoiding `Array.from` and array sorting in
compiler source.

Rejected alternatives: teaching codegen about `Array.from` would be a broader
builtin/API addition than this blocker needs; removing canonical sorting would
make union equality and generated names depend on map iteration order.

## Implementation

- `src/codegen.ts:324` now builds `sorted` by pushing each deduplicated variant
  and shifting larger keys one slot to the right.
- `src/codegen.ts:452` adds `typeKeyLess`, an ASCII byte-wise comparator over
  `charCodeAt`.
- The existing empty and single-variant handling remains unchanged.

## Consequences

- **Accepted**: `makeUnion` remains deterministic and subset-compatible.
- **Rejected**: no new Array runtime builtin is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
