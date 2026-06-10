# 0379 - runtime prelude parseInt migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.52

## Context

ADR [0003](./0003-parse-int-float.md) originally lowered global
`parseInt(s, radix)` and `parseFloat(s)` to C helpers for the self-hosted
number-literal parser. After the runtime prelude lane matured through ADR
[0378](./0378-runtime-prelude-file-url-path.md), `parseInt` became a pure byte
scanner over `.length` and `charCodeAt`, while `parseFloat` still relies on
libc `strtod` for decimal/exponent parsing and roundoff behavior.

## Decision

Move the public `parseInt(s, radix)` lowering target to internal
`__topaz_parse_int(s, radix)` in `runtime/prelude.ts`, using the stable
`runtime_prelude` C symbol. Keep the public call shape and diagnostics
unchanged: exactly two arguments, first argument `string`, radix `number`, and
call-site-only recognition. Remove the old C `topaz_parse_int(...)` helper and
its substrate inventory entry. Keep `topaz_parse_float(...)` in C.

Rejected alternatives: migrating `parseFloat` was rejected because matching
decimal grammar and `strtod` roundoff is larger than this phase; exposing
`__topaz_parse_int` or adding `Number.parseInt` was rejected because the helper
is compiler-owned; broadening the migration to formatting, BigInt, containers,
or string allocation primitives was rejected to keep this phase isolated.

## Implementation

- `runtime/prelude.ts` adds `__topaz_parse_int_digit_value(...)` and
  `__topaz_parse_int(...)`, preserving radix truncation, ASCII whitespace,
  leading sign, auto-base `0` handling, optional `0x` / `0X`, invalid digit
  stop, and `0 / 0` NaN generation.
- `src/codegen.ts` still checks `parseInt` arguments in the existing helper but
  emits `requireInternalPreludeFunctionCName("__topaz_parse_int", ...)`.
- `runtime/runtime.h` removes `topaz_parse_int(...)` and documents that
  `topaz_parse_float(...)` remains the `strtod` substrate.
- `scripts/check-runtime-substrate.mjs` drops `topaz_parse_int` from the C
  substrate inventory; `src/runtime_header.ts` and `src/runtime_prelude.ts` are
  regenerated from the runtime sources.

## Consequences

- **Accepted**: public `parseInt(s, radix): number` behavior and diagnostics
  remain stable while pure parsing logic leaves the C header.
- **Accepted**: radix `0` decimal/octal/hex, radix `16` prefix, sign,
  whitespace, bad radix, and no-digit cases are covered explicitly.
- **Regression**: `parse_number`, `runtime_prelude_parse_int`, and
  `runtime_prelude_parse_int_hidden_fail` lock the migration boundary.
- **Scope outside**: `parseFloat`, `Number.parseInt`, one-argument auto-radix,
  number formatting, BigInt, containers, and allocation primitives remain
  unchanged.
