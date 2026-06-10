# 0403 - bigint decimal parse prelude migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.76

## Context

ADR [0402](./0402-bigint-multiplication-prelude.md) moved public BigInt
multiplication into the runtime prelude, leaving decimal literal construction
and decimal formatting as the remaining BigInt algorithmic C helpers. Literal
construction was still a special codegen ingress through
`topaz_bigint_from_decimal_cstr(...)`, even though the hidden `BigIntBuffer`
family can now build immutable bigint values from Topaz-subset code.

## Decision

Route decimal bigint literals through runtime prelude
`__topaz_bigint_from_decimal(digits)`. Codegen continues to use
`decimalBigIntDigits(...)` as the source-side decimal-only filter, then passes
the filtered digits as a normal Topaz string literal. The prelude parser scans
ASCII digits left to right, multiplies the mutable `BigIntBuffer` by 10, adds
the next digit, and materializes through
`__topaz_bigint_buffer_to_bigint(...)` with canonical zero or positive sign.
Rejected alternatives: keeping `topaz_bigint_from_decimal_cstr(...)` was
rejected because literal construction would still enter through C; migrating
formatting in this phase was rejected because `topaz_bigint_to_string(...)`
uses a separate divide-by-1e9 algorithm and string materialization path;
changing accepted literal syntax was rejected because this phase only moves the
existing decimal parser.

## Implementation

- `runtime/prelude.ts:158` adds small-buffer multiply/add helpers, and
  `runtime/prelude.ts:194` adds `__topaz_bigint_from_decimal(digits)`.
- `src/codegen.ts:2140` adds the stable runtime prelude emission helper, and
  `src/codegen.ts:8050` routes `bigint_lit` through it after
  `decimalBigIntDigits(...)` validation.
- `runtime/runtime.h:213` now continues directly to decimal formatting after
  removing `topaz_bigint_from_decimal_cstr(...)` and its private small-limb
  helpers.
- `scripts/check-runtime-substrate.mjs:127` leaves decimal formatting as the
  next BigInt substrate entry, so `tests/smoke.sh:22` asserts
  `needs-bigint-limb-intrinsics: 3` while keeping
  `bigint-limb-intrinsic-family: 8`.

## Consequences

- **Accepted**: decimal bigint literals now exercise Topaz-subset runtime
  prelude code for ASCII digit validation, base-2^32 carry splitting,
  canonical zero, positive sign materialization, and existing arithmetic /
  stringification interop.
- **Rejected**: non-decimal bigint literals, leading-zero decimal spellings,
  BigInt constructor parsing, and decimal formatting remain outside this
  migration. Leading-zero bigint source such as `0123n` is skipped because the
  TypeScript frontend reports it as an octal literal before codegen.
- **Regression**: `examples/bigint_decimal_parse_prelude.ts` covers `0n`, a
  small decimal literal, a large multi-limb literal, addition, multiplication,
  and template stringification. `tests/smoke.sh` checks generated C uses
  `topaz_fn_runtime_prelude___topaz_bigint_from_decimal` and has no standalone
  `topaz_bigint_from_decimal_cstr(...)`,
  `topaz_bigint_mul_small_in_place(...)`, or
  `topaz_bigint_add_small_in_place(...)`. The smoke suite now registers 380
  cases.
- **Hidden surface**:
  `examples/runtime_prelude_bigint_from_decimal_hidden_fail.ts` keeps
  `__topaz_bigint_from_decimal(...)` unavailable to user source.
- **Next**: later BigInt migration can target decimal formatting once string
  materialization and divide-by-1e9 behavior have a prelude design.
