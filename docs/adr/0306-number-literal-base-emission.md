# 0306 - Number literal base emission

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: worker 273

## Context

After [0305](./0305-cli-unknown-catch-fallback-diagnostic.md), the full graph
self-host probe advanced from Topaz codegen diagnostics to validating generated
C. Numeric literal emission reused raw TypeScript source text and appended
`.0` to every integer-looking literal, so self-host C contained invalid forms
such as `0x22.0`.

## Decision

Keep the numeric literal forms the frontend already accepts, but emit
non-decimal integer literals through their parsed AST numeric value. Decimal
and exponent source text remains unchanged except for the existing `.0` suffix
on decimal integer-looking literals; hex and binary source text is normalized
to decimal C floating-literal spelling before that same suffix rule is applied.

Rejected alternatives: preserving `0x...` unchanged was rejected because it
keeps binary literals dependent on compiler extensions and mixes C integer
spellings into `topaz_number` emission; rejecting hex and binary literals was
rejected because it shrinks accepted TypeScript coverage; emitting C hex float
syntax such as `0x22p0` was rejected because it only solves hex and makes the
C output less uniform.

## Implementation

- `src/codegen.ts:524` adds a prefix classifier for `0x` / `0X` / `0b` / `0B`
  integer literal text.
- `src/codegen.ts:530` centralizes number literal C spelling in
  `emitNumberLiteralText(text, value)`.
- `src/codegen.ts:6135` and `src/codegen.ts:6145` use the helper for scalar
  module-global numeric literals, including unary `+` / `-`.
- `src/codegen.ts:7091` uses the same helper for normal expression emission.

## Consequences

- **Accepted**: `0x22`, `0X10`, `0b1010`, and `0B11` continue to parse and now
  emit as decimal C number literals such as `34.0` and `10.0`.
- **Accepted**: decimal integer, decimal fraction, and exponent literal
  behavior is unchanged.
- **Regression**: `examples/number_literal_bases.ts` covers prefix variants,
  arithmetic, and comparisons; `tests/smoke.sh:471` adds the positive smoke
  case. The suite now has 296 smoke entries.
- **Self-host**: the old `hexadecimal floating constant requires an exponent`
  generated-C blocker is removed. The next observed C blockers are independent
  optional-string comparison and captured-`this` arrow emission issues.
- **Scope out**: numeric separators, BigInt, octal, and broader ECMAScript
  numeric literal edge cases remain outside the current lexer/parser subset.
