# 0389 - string buffer intrinsic substrate

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.62

## Context

ADR [0388](./0388-string-buffer-intrinsic-family.md) fixed the next migration
target: an opaque `StringBuffer` pseudo type plus five hidden intrinsics usable
only from the internal runtime prelude. The old Phase 3.60 lane remains pinned
to `topaz_string_byte_at(...)` and `topaz_string_from_byte_codes(...)`, so the
first implementation slice needs to add the new substrate without confusing
that legacy boundary.

## Decision

Implement `StringBuffer` as a compiler-internal type annotation accepted only
for `runtime/prelude.ts`, lower the five `__topaz_string_buffer_*` calls only
while compiling that internal module, and classify the C helpers in a distinct
`string-buffer-intrinsic-family` migration lane. Migrate only
`__topaz_string_from_char_code(n)` to prove allocation/push/materialization.
Rejected alternatives: making `StringBuffer` a class/interface/import was
rejected because it is not public language surface; reclassifying the old
byte-code helpers was rejected because concat/repeat/slice/fileURLToPath and
charCodeAt still use them; migrating all allocation clients at once was
rejected to keep this slice reversible.

## Implementation

- `runtime/runtime.h:82` adds `topaz_string_buffer`;
  `runtime/runtime.h:394` adds the five arena-backed helpers, and
  `topaz_string_buffer_to_string(...)` copies into immutable string storage.
- `src/codegen.ts:75` adds the `string_buffer` pseudo type,
  `src/codegen.ts:3849` accepts `StringBuffer` annotations only for the runtime
  prelude, and `src/codegen.ts:9239` / `src/codegen.ts:10284` lower the five
  `__topaz_string_buffer_*` helpers.
- `runtime/prelude.ts:19` changes only `__topaz_string_from_char_code(n)` from
  the temporary `Array<number>` bridge to the new buffer path.
- `scripts/check-runtime-substrate.mjs:25` keeps the Phase 3.60 boundary pinned
  to the old two symbols and classifies the new family separately.

## Consequences

- **Accepted**: `String.fromCharCode(...)` still has the same public surface and
  output while generated C now exercises the string-buffer substrate.
- **Reject**: user source calling `__topaz_string_buffer_new(1)` still reports
  `unknown identifier '__topaz_string_buffer_new'`.
- **Regression**: `runtime_prelude_string_from_char_code` checks for
  `topaz_string_buffer_` use and absence of `topaz_string_from_byte_codes(...)`;
  `runtime_prelude_string_buffer_hidden_fail` covers the hidden helper.
- **Scope outside**: concat, repeat, slice, fileURLToPath, charCodeAt, public
  stdlib descriptors, loader lookup behavior, manifest, doctor, check, explain,
  and release workflow files are unchanged.
