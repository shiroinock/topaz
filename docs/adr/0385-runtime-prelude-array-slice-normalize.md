# 0385 - runtime prelude Array.slice normalization

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.58

## Context

After `String.slice`, string concat, and `String.repeat` moved to
`runtime/prelude.ts`, `topaz_slice_normalize(...)` was the remaining
string-buffer-lane helper whose algorithm was pure numeric normalization rather
than byte access or allocation. `Array.prototype.slice` still needs generated C
for receiver snapshotting, monomorphized destination allocation, reserve, and
element copying, but start/end index normalization can be expressed in
Topaz-subset TypeScript.

## Decision

Add internal prelude helper `__topaz_slice_normalize(n, len, def)` and lower
`Array.prototype.slice(start?, end?)` bounds to its stable `runtime_prelude` C
symbol. The helper preserves the existing NaN omitted-argument sentinel,
negative offset from length, clamp to `[0, len]`, positive/negative infinity
clamps, and fractional truncation toward zero. Codegen keeps the receiver
snapshot, raw start/end temporaries, `hi < lo` clamp, destination allocation,
reserve, and element copy loop in generated C.

Rejected alternatives: migrating `topaz_string_char_code_at(...)` or
`__topaz_string_from_byte_codes(...)` was rejected because those remain the
byte-oriented string substrate; migrating Array storage/copy helpers, Map/Set
containers, or container monomorphization was rejected because this phase only
shrinks a pure numeric helper; changing `String.prototype.slice` was rejected
because it already targets `__topaz_string_slice(...)`.

## Implementation

- `runtime/prelude.ts:71` adds `__topaz_slice_normalize(...)` beside the recent
  string prelude helpers.
- `src/codegen.ts:9537` now routes the two `Array.slice` bound normalizations
  through `requireInternalPreludeFunctionCName("__topaz_slice_normalize", ...)`
  and casts the returned `topaz_number` to `size_t` for `lo` and `hi`.
- `runtime/runtime.h:376` now moves directly from `topaz_fmod(...)` to the
  filesystem substrate, with stale `topaz_slice_normalize(...)` removed; the
  substrate inventory now moves from `topaz_string_char_code_at` directly to
  `topaz_string_from_byte_codes` at `scripts/check-runtime-substrate.mjs:224`.
- `src/runtime_header.ts` and `src/runtime_prelude.ts` are regenerated from the
  runtime sources.
- `tests/smoke.sh:292` checks generated C for the new stable prelude symbol,
  absence of stale helper calls/definitions, unchanged `array_method_slice`
  output, and hidden helper rejection at `tests/smoke.sh:961`.

## Consequences

- **Accepted**: `xs.slice()`, `xs.slice(start)`, `xs.slice(start, end)`,
  negative bounds, omitted `end`, out-of-range bounds, `start > end`, and
  fractional numeric bounds keep their existing behavior.
- **Rejected**: public non-number and too-many-argument diagnostics stay
  unchanged; user source still cannot call `__topaz_slice_normalize(...)`
  directly.
- **Regression**: `runtime_prelude_array_slice_normalize` locks the generated-C
  route and behavior, and `runtime_prelude_array_slice_normalize_hidden_fail`
  keeps the helper hidden from user source. The scripted `run_*` smoke case
  count is 365.
- **Scope outside**: no `charCodeAt`, `__topaz_string_from_byte_codes`, Array
  storage/copy helper, Map/Set container, `String.slice`, or
  string-buffer-intrinsic migration.
