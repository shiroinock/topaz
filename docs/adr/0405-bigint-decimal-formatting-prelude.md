# 0405 - bigint decimal formatting prelude

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.78

## Context

ADR [0404](./0404-bigint-buffer-materialization-cleanup.md) left
`topaz_bigint_to_string(...)` as the final standalone helper in the
`needs-bigint-limb-intrinsics` migration lane. The hidden `BigIntBuffer` limb
family and `StringBuffer` materialization family are now available to the
runtime prelude, so decimal formatting can move out of C without changing the
public BigInt ABI or observable string output.

## Decision

Add runtime prelude `__topaz_bigint_to_string(value)` and route template literal
substitution plus `console.log` / `console.error` / `console.warn` BigInt
arguments through that stable internal symbol. The formatter copies absolute
32-bit limbs into a scratch `BigIntBuffer`, repeatedly divides by 1e9 using
16-bit chunks, collects base-1e9 decimal groups, and writes ASCII decimal bytes
to `StringBuffer` with lower groups padded to width 9. Rejected alternatives:
keeping `topaz_bigint_to_string(...)` in C was rejected because it was the last
standalone BigInt migration-lane helper; using `topaz_number_to_string(...)`
for groups was rejected because BigInt formatting should not depend on number
formatting; adding a new C division helper was rejected because 16-bit chunk
division keeps all Topaz `number` intermediates exact; changing BigInt ABI or
formatting semantics was rejected.

## Implementation

- `runtime/prelude.ts:292` adds exact
  `__topaz_bigint_buffer_divmod_decimal_group(...)`,
  `runtime/prelude.ts:313` adds decimal byte pushing, and
  `runtime/prelude.ts:336` adds `__topaz_bigint_to_string(...)`.
- `src/codegen.ts:2145` adds `emitRuntimePreludeBigIntToString(...)`;
  `src/codegen.ts:9045` uses it for BigInt template literal substitutions, and
  `src/codegen.ts:9172` uses it for BigInt console arguments.
- `runtime/runtime.h:202` removes the standalone C `topaz_bigint_to_string(...)`
  helper while preserving limb inspection, `BigIntBuffer`, `StringBuffer`, and
  host IO substrate helpers.
- `scripts/check-runtime-substrate.mjs:115` removes the stale inventory entry;
  smoke now rejects any remaining `needs-bigint-limb-intrinsics` lane while
  keeping `bigint-limb-intrinsic-family: 8`.
- `tests/smoke.sh:605` checks generated C for
  `topaz_fn_runtime_prelude___topaz_bigint_to_string`, rejects standalone
  `topaz_bigint_to_string(`, `tests/smoke.sh:639` confirms the prelude body
  uses `StringBuffer` instead of `topaz_number_to_string(...)`, and
  `tests/smoke.sh:1339` keeps hidden helper inaccessibility covered.

## Consequences

- **Accepted**: canonical zero, negative sign prefix, no leading zeroes,
  9-digit lower decimal groups, large multi-limb values, console BigInt IO, and
  template literal BigInt substitution keep their previous observable output.
- **Rejected**: user modules still cannot call hidden
  `__topaz_bigint_to_string(...)`.
- **Regression**: existing `bigint_large_limb`, `bigint_sign_zero`,
  `template_literal`, and numeric console generated-C checks cover public
  output; new `runtime_prelude_bigint_to_string_hidden_fail` covers hidden
  helper inaccessibility.
- **Scope外**: public `bigint.toString()`, non-decimal BigInt literals,
  bigint containers, and number formatting substrate migration remain separate
  work.
