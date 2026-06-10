# 0398 - bigint equality prelude migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.71

## Context

ADR [0396](./0396-bigint-limb-intrinsic-family.md) fixed the hidden BigInt limb
intrinsic family, and ADR [0397](./0397-bigint-buffer-intrinsic-substrate.md)
implemented the `BigIntBuffer` / immutable limb-inspection substrate. BigInt
equality is the smallest public consumer migration because it only needs sign,
limb length, and limb reads; it does not need result construction, decimal
parsing, or formatting.

## Decision

Route public bigint `===` / `!==` through runtime prelude
`__topaz_bigint_eq(a, b)` and delete the C `topaz_bigint_eq(...)` helper. The
prelude helper preserves the previous semantics by rejecting sign mismatches,
accepting canonical zero equality, comparing limb lengths, and then comparing
little-endian limbs one by one. Rejected alternatives: migrating
`topaz_bigint_cmp(...)` was rejected because ordering is a separate signed
comparison surface; migrating arithmetic was rejected because add/sub/mul need
fresh result construction and carry/borrow loops; exposing
`__topaz_bigint_eq(...)` to user modules was rejected because the helper remains
compiler-owned runtime machinery.

## Implementation

- `runtime/prelude.ts:39` adds `__topaz_bigint_eq(a, b)` using only
  `__topaz_bigint_sign`, `__topaz_bigint_limb_len`, and `__topaz_bigint_limb`.
- `src/codegen.ts:2110` adds a stable runtime prelude emission helper, and
  `src/codegen.ts:8403` routes bigint `===` / `!==` through it while leaving
  arithmetic and ordering on the existing C helpers.
- `runtime/runtime.h:377` removes the old equality helper, and regenerated
  `src/runtime_header.ts` / `src/runtime_prelude.ts` mirror the runtime sources.
- `scripts/check-runtime-substrate.mjs:199` removes `topaz_bigint_eq` from the
  inventory, so `tests/smoke.sh:22` now asserts `needs-bigint-limb-intrinsics:
  16` while keeping `bigint-limb-intrinsic-family: 8`.

## Consequences

- **Accepted**: bigint equality now exercises Topaz-subset runtime prelude code
  for a public BigInt operator while preserving observable output.
- **Rejected**: ordering, arithmetic, literal parsing, and
  `topaz_bigint_to_string(...)` remain in the C substrate.
- **Regression**: `examples/bigint_equality.ts` covers small equality,
  inequality, negative equality, multi-limb equality/inequality, and
  zero-normalizing arithmetic; `tests/smoke.sh:657` checks generated C uses
  `topaz_fn_runtime_prelude___topaz_bigint_eq` and no standalone
  `topaz_bigint_eq(...)`; `examples/runtime_prelude_bigint_eq_hidden_fail.ts`
  keeps the helper hidden from user source.
- **Next**: the next BigInt migration can target signed comparison or a smaller
  result-producing helper such as unary negation / copy-abs.
