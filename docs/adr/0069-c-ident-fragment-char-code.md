# 0069. cIdentFragment charCodeAt rewrite (6i prep)

- **Status**: Accepted
- **Date**: 2026-06-03
- **Phase**: 1.5-6i prep

## Context

[0068](./0068-required-param-count-indexed-non-null-cleanup.md) moved the full
graph self-host probe to `src/codegen.ts:990`, where `cIdentFragment` read
characters with `raw[i]`. Topaz string indexing is unsupported; string byte
access goes through `charCodeAt`.

## Decision

Rewrite `cIdentFragment` to use ASCII code checks from `charCodeAt` and emit
accepted characters with `String.fromCharCode`. The initial digit guard also
uses `charCodeAt(0)`.

Rejected alternatives: adding string index access would be a language/runtime
feature decision; keeping string relational comparisons would immediately hit
the subset's numeric-only relational operator rule.

## Implementation

- `src/codegen.ts:990` replaces `raw[i]` with `raw.charCodeAt(i)`.
- `src/codegen.ts:992` compares ASCII numeric ranges instead of string
  relational operators.
- `src/codegen.ts:997` uses `String.fromCharCode(code)` to append accepted
  characters.
- `src/codegen.ts:1003` checks the first output byte with `out.charCodeAt(0)`.

## Consequences

- **Accepted**: identifier escaping behavior remains ASCII-byte based.
- **Rejected**: no string index access is added.
- **Regression**: no new example was added because emitted behavior is
  unchanged; the full graph self-host probe covers this compiler-source
  cleanup.
