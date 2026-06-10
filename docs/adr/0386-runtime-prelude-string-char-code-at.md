# 0386 - runtime prelude String.charCodeAt

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.59

## Context

After Phase 3.58, the `needs-string-buffer-intrinsics` lane had only two
string helpers left: byte reads and byte-string materialization.
`String.prototype.charCodeAt(index)` still lowered directly to
`topaz_string_char_code_at(...)`, which mixed public method semantics with raw
byte access. The runtime prelude already has enough numeric control flow to
express NaN, negative, out-of-range, and fractional-index behavior.

## Decision

Add internal prelude helper `__topaz_string_char_code_at(s, index)` and lower
public `String.prototype.charCodeAt(index)` to its stable `runtime_prelude` C
symbol. Codegen keeps the existing public arity and type diagnostics, while the
prelude helper preserves the current Topaz behavior: NaN, negative, and
out-of-range inputs return NaN, and positive in-range fractional inputs
truncate toward zero before reading.

Rejected alternatives: keeping `topaz_string_char_code_at(...)` as the public
semantic helper was rejected because it keeps method behavior in C; migrating
`topaz_string_from_byte_codes(...)`, `String.slice`, string concat,
`String.repeat`, Array/Map/Set, BigInt, numeric, host, or exception substrate
was rejected because this phase only sharpens the string read boundary; exposing
the helper to user source was rejected because runtime prelude helpers remain
compiler-owned internals.

## Implementation

- `runtime/prelude.ts:30` adds `__topaz_string_char_code_at(...)`, which
  delegates valid reads to hidden `__topaz_string_byte_at(...)`.
- `src/codegen.ts:9805` lowers public `.charCodeAt(index)` to the stable
  runtime prelude symbol after preserving the existing diagnostics.
- `src/codegen.ts:10228` adds internal-prelude-only
  `__topaz_string_byte_at(s, index)` checking and lowering to
  `topaz_string_byte_at(...)`; user modules still resolve neither helper.
- `runtime/runtime.h:360` replaces stale `topaz_string_char_code_at(...)` with
  raw `topaz_string_byte_at(...)`, and
  `scripts/check-runtime-substrate.mjs:218` updates the inventory reason.
- `src/runtime_header.ts` and `src/runtime_prelude.ts` are regenerated from the
  runtime sources.
- `tests/smoke.sh:269` checks generated C for the stable charCodeAt prelude
  symbol, raw byte substrate use, stale helper absence, unchanged output, and
  hidden helper rejection.

## Consequences

- **Accepted**: `"hello".charCodeAt(0)`, `(1)`, `(4)`, out-of-range positive
  index, negative index, positive fractional in-range truncation, and
  `String.fromCharCode(...).charCodeAt(0)` keep their existing behavior.
- **Rejected**: wrong arity and non-number diagnostics stay unchanged; user
  source still cannot call `__topaz_string_char_code_at(...)` or
  `__topaz_string_byte_at(...)` directly.
- **Regression**: `runtime_prelude_string_char_code_at` locks the generated-C
  route and behavior, while the two hidden fail cases keep both internal
  helpers out of user scope. The scripted `run_*` smoke case count is 367.
- **Scope outside**: no `topaz_string_from_byte_codes`, `String.slice`, string
  concat, `String.repeat`, Array/Map/Set, BigInt, numeric, host, exception, or
  general string-buffer intrinsic migration.
