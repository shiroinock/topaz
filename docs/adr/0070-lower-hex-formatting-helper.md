# 0070. lower-hex formatting helper (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0069](./0069-c-ident-fragment-char-code.md) moved the full graph self-host
probe to `src/codegen.ts:999`, where `cIdentFragment` used
`number.toString(16)`. The same hex formatting pattern also existed in string
literal escaping with `.padStart(2, "0")`. Topaz does not support numeric
`toString(radix)` or string `padStart`.

## Decision

Add small lower-hex formatting helpers built from arithmetic and
`String.fromCharCode`, then use them for identifier fragments and string
literal byte escapes. Also replace the adjacent internal plain `Error` in the
compound string encoder with `throwInternalCodegenError`.

Rejected alternatives: adding `Number.prototype.toString(radix)` and
`String.prototype.padStart` would be broader library/runtime work; keeping the
helpers local avoids changing emitted runtime behavior.

## Implementation

- `src/codegen.ts:987` adds `lowerHexDigit`, `lowerHexNumber`, and
  `lowerHexByte2`.
- `src/codegen.ts:1019` uses `lowerHexNumber` for C identifier escaping.
- `src/codegen.ts:6730` and `src/codegen.ts:9712` use `lowerHexByte2` for
  `\xNN` string escaping.
- `src/codegen.ts:9704` replaces an internal plain `Error` with
  `throwInternalCodegenError`.

## Consequences

- **Accepted**: hex escaping remains lower-case and deterministic.
- **Rejected**: no number radix formatting or string padding APIs are added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
