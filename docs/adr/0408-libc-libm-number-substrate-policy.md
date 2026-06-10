# 0408 - libc/libm number substrate policy

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.81

## Context

Phase 3.78 moved decimal BigInt formatting to the runtime prelude, and ADR
[0406](./0406-legacy-runtime-migration-lanes-closed.md) / ADR
[0407](./0407-closed-runtime-migration-guidance.md) closed the ordinary legacy
StringBuffer and BigInt migration lanes. The remaining
`libc-libm-boundary` symbols are not leftover easy copies. They are the number
substrate helpers whose behavior depends on libc/libm compatibility:
`topaz_fmod(...)`, `topaz_parse_float(...)`, and
`topaz_number_to_string(...)`. Prior context also kept `parseFloat` in C while
moving `parseInt` in ADR [0379](./0379-runtime-prelude-parse-int.md), and
treated numeric formatting as its own policy in ADR
[0348](./0348-number-to-string.md).

## Decision

Keep the three number helpers in `libc-libm-boundary` before v0.2.0 and treat
any future movement as an explicit number-substrate replacement decision. A
replacement must preserve the current parse, roundoff, remainder, and
formatting behavior, rather than migrating these helpers one at a time as
ordinary runtime prelude algorithms. Rejected alternatives: migrating
`parseFloat` now was rejected because decimal/exponent grammar and `strtod`
roundoff are larger than this phase; migrating `topaz_number_to_string` now was
rejected because the current ECMA-262 behavior depends on shortest-roundtrip
formatting and libc `strtod`; migrating `topaz_fmod` now was rejected because
public `%` currently delegates to libm `fmod`; closing `libc-libm-boundary` was
rejected because these three substrate symbols remain active.

## Implementation

- `scripts/check-runtime-substrate.mjs:31` updates `NEXT.LIBC_LIBM` to name the
  pinned pre-v0.2 number substrate boundary and the three helper
  responsibilities.
- `tests/smoke.sh:29` asserts that the normal substrate summary still includes
  `libc-libm-boundary: 3`.
- `docs/runtime-ts-migration.md:67` documents the Phase 3.81 number substrate
  policy and distinguishes it from pure Topaz-subset prelude helper
  migrations.
- `MEMO.md:322` records Phase 3.81 as a checker/docs/test-only policy pin.

## Consequences

- **Accepted**: `topaz_fmod`, `topaz_parse_float`, and
  `topaz_number_to_string` remain visible as the three-symbol
  `libc-libm-boundary` lane.
- **Accepted**: future work can still replace the number substrate with a
  custom remainder algorithm, decimal parser, or Ryu-like formatter after a
  focused ADR and behavior coverage.
- **Rejected**: helper-by-helper runtime prelude migration no longer applies to
  these number substrate helpers.
- **Regression**: `pnpm run check:runtime-substrate` reports
  `libc-libm-boundary: 3`, and `pnpm test` now asserts that lane count in the
  main smoke gate.
- **Scope外**: runtime behavior, generated C lowering, public APIs,
  `runtime/runtime.h`, `runtime/prelude.ts`, generated runtime files, and
  `src/codegen.ts` are unchanged.
