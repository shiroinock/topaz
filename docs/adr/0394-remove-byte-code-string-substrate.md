# 0394 - remove byte-code string substrate

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.67

## Context

ADR [0387](./0387-string-buffer-intrinsic-boundary.md) pinned the temporary
string-buffer boundary to `topaz_string_byte_at(...)` and
`topaz_string_from_byte_codes(...)`. ADR
[0389](./0389-string-buffer-intrinsic-substrate.md) introduced the
compiler-owned `StringBuffer` family. Phases 3.63 through 3.66 moved concat,
repeat, slice, and fileURLToPath off the byte-code materialization bridge, and
current scout shows no runtime prelude client still needs
`__topaz_string_from_byte_codes(...)`.

## Decision

Remove the unused byte-code string materialization helper from the runtime
header, generated header, codegen hidden-helper handling, substrate inventory,
and stale hidden-helper smoke/example coverage. Keep
`topaz_string_byte_at(...)` as the sole `needs-string-buffer-intrinsics` symbol
for the `charCodeAt` raw-read path. Rejected alternatives: migrating
`__topaz_string_char_code_at(...)` or removing `topaz_string_byte_at(...)` now
was rejected because raw immutable string reads are a separate design question;
keeping `topaz_string_from_byte_codes(...)` unused was rejected because the
substrate inventory should prove the bridge is gone; reintroducing byte-array
string materialization under another helper name was rejected because
`StringBuffer` is the accepted allocation/copying escape hatch.

## Implementation

- `runtime/runtime.h` removes `topaz_string_from_byte_codes(...)` while keeping
  `topaz_string_byte_at(...)`.
- `src/codegen.ts` no longer special-cases
  `__topaz_string_from_byte_codes(...)` in runtime prelude emit or inference.
- `scripts/check-runtime-substrate.mjs` shrinks
  `STRING_BUFFER_INTRINSIC_BOUNDARY` to `topaz_string_byte_at` and removes the
  old inventory entry.
- `tests/smoke.sh` updates the boundary assertion, removes the stale hidden
  fail case, and rejects generated C that embeds or calls
  `topaz_string_from_byte_codes(...)` across exercised string outputs.
- `src/runtime_header.ts` is regenerated from the runtime header.

## Consequences

- **Accepted**: `needs-string-buffer-intrinsics` now has one symbol,
  `topaz_string_byte_at(...)`, while `string-buffer-intrinsic-family` remains
  the five-symbol `StringBuffer` family.
- **Reject**: generated C must not contain a callable
  `topaz_string_from_byte_codes(...)` definition or call, and runtime prelude
  source must not use the old hidden helper.
- **Regression**: existing fromCharCode, concat, repeat, slice, fileURLToPath,
  and charCodeAt smoke outputs remain unchanged; the stale
  `runtime_prelude_byte_codes_hidden_fail` example is deleted.
- **Scope outside**: public string and URL behavior, `charCodeAt` raw byte
  reads, manifest, doctor, check, explain, release workflow files, and
  historical ADRs are unchanged.
