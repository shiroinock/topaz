# 0404 - bigint buffer materialization cleanup

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.77

## Context

ADR [0403](./0403-bigint-decimal-parse-prelude.md) moved decimal BigInt literal
construction into the runtime prelude, leaving `topaz_bigint_to_string(...)` as
the only public BigInt algorithm still intentionally implemented in C. Two
private helpers, `topaz_bigint_alloc(...)` and `topaz_bigint_normalize(...)`,
remained in the `needs-bigint-limb-intrinsics` migration lane even though their
only remaining purpose was implementation detail inside the hidden
`BigIntBuffer` materialization boundary.

## Decision

Fold bigint allocation and normalization directly into
`topaz_bigint_buffer_to_bigint(buffer, sign)`. The generated C ABI remains
`topaz_bigint *` with little-endian 32-bit limbs and canonical sign-zero for
zero. Materialization now validates the sign, trims trailing zero limbs from the
buffer view, rejects nonzero materialization with sign `0`, allocates the
immutable result object, copies only normalized limbs, and assigns the final
canonical sign. Rejected alternatives: migrating `topaz_bigint_to_string(...)`
in this phase was rejected because formatting needs a separate long-division
and string materialization design; changing `BigIntBuffer` or exposing
allocation helpers to prelude TS was rejected because this is only a C
substrate cleanup; keeping the helpers in the lane was rejected because they are
no longer standalone migration targets.

## Implementation

- `runtime/runtime.h:104` removes `topaz_bigint_alloc(...)` and
  `topaz_bigint_normalize(...)`.
- `runtime/runtime.h:142` keeps `topaz_bigint_buffer_to_bigint(...)` as the
  single C materialization boundary and inlines trailing-zero normalization,
  arena allocation, limb copy, and sign canonicalization.
- `scripts/check-runtime-substrate.mjs:115` removes the two stale inventory
  entries, shrinking `needs-bigint-limb-intrinsics` from `3` to `1` while
  leaving `bigint-limb-intrinsic-family: 8`.
- `tests/smoke.sh:22` updates the lane assertion, and
  `tests/smoke.sh:654` checks generated C for the buffer-prelude case contains
  no standalone `topaz_bigint_alloc(...)` or `topaz_bigint_normalize(...)`.

## Consequences

- **Accepted**: canonical `0n`, decimal parse, add/sub/mul, hidden
  `BigIntBuffer` materialization, and public BigInt behavior keep the same ABI
  and observable results.
- **Rejected**: decimal formatting remains in C as
  `topaz_bigint_to_string(...)`; its future migration is a separate phase.
- **Regression**: existing BigInt positive/fail cases continue to cover zero,
  normalized arithmetic, decimal literal materialization, hidden helper
  inaccessibility, and stringification. The generated-C smoke now also rejects
  stale standalone allocation/normalization helper emission.
- **Next**: the BigInt lane can focus on the remaining formatting helper once
  its exact divide-by-1e9 and string-buffer materialization design is fixed.
