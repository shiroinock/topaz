# 0395 - remove string byte-read substrate

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.68

## Context

ADR [0394](./0394-remove-byte-code-string-substrate.md) removed the byte-code
string materialization bridge and left `topaz_string_byte_at(...)` as the only
`needs-string-buffer-intrinsics` symbol. That helper is only used by hidden
runtime-prelude `__topaz_string_byte_at(s, index)`, which is called from
`__topaz_string_char_code_at(s, index)` after the TS prelude handles NaN,
negative, out-of-range, and fractional truncation behavior. Copying an
immutable string into a `StringBuffer` for every `charCodeAt` read would
preserve behavior but make byte scans such as string equality and path parsing
accidentally quadratic.

## Decision

Remove `topaz_string_byte_at(...)` from the runtime header and substrate
inventory. Keep hidden `__topaz_string_byte_at(s, index)` as a
runtime-prelude-only compiler intrinsic, but lower it directly to generated C
that reads `topaz_string.data[(size_t)i]`. Mark the old
`needs-string-buffer-intrinsics` boundary as empty while keeping the
five-symbol `StringBuffer` intrinsic family unchanged. Rejected alternatives:
copying immutable strings into `StringBuffer` before reads was rejected for
scan performance; inlining or removing `__topaz_string_char_code_at(...)` was
rejected because public charCodeAt edge-case policy remains easier to audit in
TS; exposing `__topaz_string_byte_at(...)` to user modules was rejected because
hidden prelude intrinsics are not public API; changing `topaz_string` layout,
ASCII policy, equality, or public charCodeAt diagnostics was outside scope.

## Implementation

- `runtime/runtime.h` removes the `topaz_string_byte_at(...)` helper; the
  generated `src/runtime_header.ts` embeds the same header after regeneration.
- `src/codegen.ts` still accepts `__topaz_string_byte_at(...)` only while
  compiling `runtime/prelude.ts`, validates `(string, number)`, and emits a
  direct `.data[(size_t)...]` byte read.
- `scripts/check-runtime-substrate.mjs` removes the old inventory entry and
  reports `string buffer intrinsic boundary: <none>`.
- `tests/smoke.sh` requires the empty boundary, rejects stale helper calls and
  definitions in generated charCodeAt C, and requires direct `.data[(size_t)`
  read evidence.
- `docs/runtime-ts-migration.md` and `MEMO.md` record that the old lane is now
  empty rather than another C helper migration queue.

## Consequences

- **Accepted**: public `String.prototype.charCodeAt(index)` output and
  diagnostics are unchanged, while the hidden prelude byte read no longer
  depends on a runtime-header helper.
- **Reject**: generated C must not contain a `topaz_string_byte_at(...)` call or
  `static inline topaz_number topaz_string_byte_at(...)` definition; user
  modules still fail `__topaz_string_byte_at(...)` with unknown identifier.
- **Regression**: `runtime_prelude_string_char_code_at` checks output,
  empty-boundary reporting, stale-helper rejection, and direct data-read
  evidence; `runtime_prelude_string_byte_at_hidden_fail` remains unchanged.
- **Scope outside**: the `StringBuffer` intrinsic family, manifest, doctor,
  check, explain, release workflow, loader, package lookup, string layout,
  ASCII policy, and string equality are unchanged.
