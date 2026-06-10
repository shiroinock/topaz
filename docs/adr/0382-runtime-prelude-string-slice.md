# 0382 - runtime prelude String.slice

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.55

## Context

`String.prototype.slice(start?, end?)` was the remaining string-specific C
helper that mixed algorithmic normalization with fresh byte-string allocation.
The runtime prelude already has byte reads through `charCodeAt` and hidden
materialization through `__topaz_string_from_byte_codes(...)`, which is enough
to preserve the existing ASCII byte semantics without adding string-buffer
intrinsics. `topaz_slice_normalize(...)` is still used by `Array.prototype.slice`
and is not stale.

## Decision

Move string slice normalization and the byte copy loop into
`runtime/prelude.ts` as `__topaz_string_slice(s, rawStart, rawEnd)`. Codegen
keeps the public `String.slice` arity/type diagnostics and still passes NaN
sentinels for omitted arguments, but it lowers the call to the stable internal
runtime prelude symbol. The prelude helper clamps bounds, truncates normalized
indices with the existing `% 1` Topaz-subset pattern, pushes source bytes into
`Array<number>`, and delegates final allocation to
`__topaz_string_from_byte_codes(...)`.

Rejected alternatives: removing `topaz_slice_normalize(...)` was rejected
because Array.slice still lowers to it directly; migrating `charCodeAt`,
`repeat`, concat, or string-buffer allocation was rejected because those are
separate substrate boundaries; changing public optional-argument diagnostics was
rejected because this phase is only a lowering/runtime migration.

## Implementation

- `runtime/prelude.ts:30` adds `__topaz_string_slice(...)` beside the other
  string prelude helpers.
- `src/codegen.ts:9817` changes `String.prototype.slice` lowering from
  `topaz_string_slice(...)` to the stable runtime prelude C symbol while
  preserving the existing argument checks.
- `runtime/runtime.h:425` keeps `topaz_slice_normalize(...)` for Array.slice
  after removing the stale string-specific C helper.
- `scripts/check-runtime-substrate.mjs:242` removes the stale
  `topaz_string_slice` inventory entry and narrows `topaz_slice_normalize` to
  the Array.slice substrate.
- `tests/smoke.sh:269` checks generated C for the prelude symbol, absence of
  the stale helper call/definition, and continued presence of
  `topaz_slice_normalize`.

## Consequences

- **Accepted**: String.slice behavior and ASCII byte semantics remain unchanged
  while the algorithmic part now lives in Topaz-subset runtime prelude code.
- **Accepted**: the `needs-string-buffer-intrinsics` inventory lane shrinks by
  one string-specific helper; `topaz_string_from_byte_codes(...)` remains the
  allocation substrate.
- **Regression**: `runtime_prelude_string_slice` locks the generated-C route and
  normal `string_method` output; `runtime_prelude_string_slice_hidden_fail`
  keeps the helper hidden from user source.
- **Scope outside**: no Array.slice migration, no charCodeAt/repeat/concat
  migration, and no new string-buffer intrinsics.
