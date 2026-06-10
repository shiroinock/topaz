# 0400 - bigint unary negation prelude migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.73

## Context

ADR [0399](./0399-bigint-ordering-prelude.md) moved public BigInt ordering into
the runtime prelude after equality. Unary negation is the next small public
BigInt result-producing surface: it needs sign inspection and fresh result
construction, but not carry/borrow arithmetic, decimal parsing, or formatting.

## Decision

Route public bigint unary `-` through runtime prelude
`__topaz_bigint_neg(value)`. The helper returns canonical `0n` for zero and
otherwise clones the immutable absolute limb sequence into a hidden
`BigIntBuffer` before materializing a fresh bigint with the opposite sign.
Rejected alternatives: keeping `topaz_bigint_neg(...)` in C was rejected because
the hidden BigInt buffer family now supports this leaf result construction;
routing binary subtraction through the prelude helper was rejected because
public `+` / `-` / `*` arithmetic remains in the C substrate for this phase;
exposing `__topaz_bigint_neg(...)` to user modules was rejected because the
helper remains compiler-owned runtime machinery.

## Implementation

- `runtime/prelude.ts:19` factors `__topaz_bigint_copy_with_sign(value, sign)`
  and adds `__topaz_bigint_neg(value)` using only the hidden BigInt limb and
  buffer intrinsics.
- `src/codegen.ts:2120` adds a stable runtime prelude negation emission helper,
  and `src/codegen.ts:8260` routes only bigint unary `-` through it while
  leaving binary add/sub/mul on `topaz_bigint_add/sub/mul`.
- `runtime/runtime.h:282` removes standalone `topaz_bigint_neg(...)`;
  `topaz_bigint_sub(...)` keeps binary subtraction in C by creating the local
  negated operand with `topaz_bigint_copy_abs(b, -b->sign)`.
- `scripts/check-runtime-substrate.mjs:157` removes the stale inventory entry,
  so `tests/smoke.sh:22` now asserts `needs-bigint-limb-intrinsics: 13` while
  keeping `bigint-limb-intrinsic-family: 8`.

## Consequences

- **Accepted**: bigint unary negation now exercises Topaz-subset runtime
  prelude code for a public result-producing BigInt operator.
- **Rejected**: binary arithmetic, literal parsing, decimal formatting,
  `topaz_bigint_copy_abs(...)`, `topaz_bigint_zero(...)`, and allocation /
  normalization helpers remain in the C substrate.
- **Regression**: `examples/bigint_unary_negation.ts` covers small sign flip,
  negative-to-positive, canonical zero equality, multi-limb sign flip, and
  binary subtraction remaining green; `tests/smoke.sh` checks generated C uses
  `topaz_fn_runtime_prelude___topaz_bigint_neg` and no standalone
  `topaz_bigint_neg(...)`; `examples/runtime_prelude_bigint_neg_hidden_fail.ts`
  keeps the helper hidden from user source.
- **Next**: later BigInt migrations can target `topaz_bigint_zero(...)`,
  `topaz_bigint_copy_abs(...)`, or individual arithmetic leaves once their
  result construction and algorithm boundaries are fixed.
