# 0384 - runtime prelude String.repeat

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.57

## Context

`String.prototype.repeat(count)` was the last string allocation client still
lowering directly to the C helper `topaz_string_repeat(...)`. After
`String.slice`, `String.fromCharCode`, and compiler-owned string concat moved to
the runtime prelude, repeat can express its range checks, count truncation,
output cap, and byte-copy loop in Topaz-subset TypeScript while still using the
existing byte-read and byte-string materialization substrate affordances.

## Decision

Add internal prelude helper `__topaz_string_repeat(s, count)` and lower public
`s.repeat(count)` calls to its stable `runtime_prelude` C symbol. Codegen keeps
the public arity/type diagnostics; the prelude helper rejects NaN, non-finite,
and negative counts, truncates positive fractions toward zero, preserves the
256MiB output cap, and materializes the result through
`__topaz_string_from_byte_codes(...)`.

Rejected alternatives: migrating `charCodeAt` or
`__topaz_string_from_byte_codes(...)` was rejected because those remain the
string-buffer substrate; adding public `Math.floor`, `Number.isFinite`,
`Infinity`, or `NaN` just for repeat was rejected because the Topaz-subset
numeric idioms are sufficient; broadening this to containers, `Array.slice`, or
string-buffer intrinsics was rejected to keep the phase scoped.

## Implementation

- `runtime/prelude.ts:45` adds `__topaz_string_repeat(...)` beside the other
  string prelude helpers.
- `src/codegen.ts:9831` now lowers `.repeat(count)` to the stable internal
  prelude C name while preserving `String.repeat expects exactly one argument`
  and `String.repeat argument must be number, got ...`.
- `runtime/runtime.h:355` now moves directly from optional wrappers to string
  equality and then `charCodeAt`, with `TOPAZ_STRING_REPEAT_MAX_BYTES` and
  `topaz_string_repeat(...)` removed; `scripts/check-runtime-substrate.mjs:218`
  removes their inventory entries.
- `src/runtime_header.ts` and `src/runtime_prelude.ts` are regenerated from the
  runtime sources.
- `tests/smoke.sh:320` checks generated C for the repeat prelude symbol,
  absence of the stale helper and macro, unchanged `string_repeat` output, and
  hidden helper rejection at `tests/smoke.sh:940`.

## Consequences

- **Accepted**: `"x".repeat(3)`, `"z".repeat(0)`,
  `"ab".slice(0, 1).repeat(2)`, string concat composition, and positive
  fractional counts keep their existing output.
- **Rejected**: public arity and non-number count diagnostics stay unchanged;
  user source still cannot call `__topaz_string_repeat(...)` directly.
- **Regression**: `runtime_prelude_string_repeat` locks the generated-C route
  and behavior, and `runtime_prelude_string_repeat_hidden_fail` keeps the helper
  hidden from user source. The scripted `run_*` smoke case count is 364.
- **Scope outside**: no `charCodeAt`, `__topaz_string_from_byte_codes`,
  container, `Array.slice`, or string-buffer-intrinsic migration.
