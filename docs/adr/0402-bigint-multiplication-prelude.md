# 0402 - bigint multiplication prelude migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.75

## Context

ADR [0401](./0401-bigint-add-sub-prelude.md) moved public BigInt binary `+` /
`-` into the runtime prelude, leaving `*` as the last public BigInt arithmetic
operator still lowered to a C helper. Multiplication cannot directly copy the C
`uint64_t` product into Topaz `number`, because a 32-bit limb product can exceed
the exact integer range available to IEEE-754 doubles.

## Decision

Route public bigint binary `*` through runtime prelude
`__topaz_bigint_mul(a, b)`. The helper preserves the previous sign and canonical
zero behavior, allocates a `BigIntBuffer` large enough for `aLen + bLen + 1`
limbs, runs the same nested little-endian limb multiplication, and materializes
through `__topaz_bigint_buffer_to_bigint(...)`. Each multiply-add step splits
both 32-bit operands, the existing output limb, and carry into 16-bit halves so
all intermediate products and sums remain exact. Rejected alternatives: a direct
32-bit `number` product was rejected because it can lose precision; keeping the
C helper was rejected because the public arithmetic surface is now ready to
finish; migrating decimal parse/format was rejected because those are separate
C string ingress/egress boundaries.

## Implementation

- `runtime/prelude.ts:158` adds `__topaz_bigint_mul_add_limb(...)`, and
  `runtime/prelude.ts:188` adds `__topaz_bigint_mul(a, b)` with zero handling,
  result-buffer initialization, nested loops, and exact carry propagation.
- `src/codegen.ts:2135` adds the stable runtime prelude emission helper, and
  `src/codegen.ts:8423` routes only bigint binary `*` through it.
- `runtime/runtime.h:270` now continues with decimal formatting after removing
  obsolete `topaz_bigint_mul(...)` and the now-unused `topaz_bigint_zero(...)`.
- `scripts/check-runtime-substrate.mjs:145` leaves decimal formatting as the
  next BigInt substrate entry, so `tests/smoke.sh:22` asserts
  `needs-bigint-limb-intrinsics: 6` while keeping
  `bigint-limb-intrinsic-family: 8`.

## Consequences

- **Accepted**: public bigint `*` now exercises Topaz-subset runtime prelude
  code for sign handling, zero multiplication, multi-limb carry propagation,
  and 16-bit half-limb exactness.
- **Rejected**: decimal literal parsing, decimal formatting, allocation,
  normalization, and hidden BigIntBuffer intrinsics remain in C.
- **Regression**: `examples/bigint_mul_prelude.ts` covers zero, negative times
  positive, negative times negative, small multiplication, multi-limb carry, and
  a limb with both low and high 16-bit halves set. `tests/smoke.sh` checks the
  generated C uses `topaz_fn_runtime_prelude___topaz_bigint_mul` and has no
  standalone `topaz_bigint_mul(...)` or `topaz_bigint_zero(...)` call or
  definition. `examples/runtime_prelude_bigint_mul_hidden_fail.ts` keeps the
  helper hidden from user source.
- **Next**: later BigInt migrations can target decimal literal parsing and
  decimal formatting once their string boundary is fixed.
