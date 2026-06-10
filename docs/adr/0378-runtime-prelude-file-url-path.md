# 0378 - runtime prelude file URL path migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.51

## Context

ADR [0377](./0377-runtime-prelude-panic-byte-string-boundary.md) fixed the
boundary for migrating `node:url.fileURLToPath(url)`: pure `file://` parsing and
percent decoding belong in `runtime/prelude.ts`, but abort diagnostics and
byte-preserving string construction need tiny C substrate affordances. The old
`topaz_url_file_url_to_path(...)` helper was the next removable URL/path C
helper, while `topaz_runtime_module_url()` still owns host syscalls and a
process-lifetime cache.

## Decision

Add two compiler-owned call-site intrinsics that are accepted only while
compiling the internal `runtime_prelude` module:
`__topaz_panic(message: string)` lowers to `topaz_panic(message)`, and
`__topaz_string_from_byte_codes(codes: Array<number>)` lowers to
`topaz_string_from_byte_codes(codes)`. Move `file://` prefix validation, empty
or `localhost` host handling, absolute path validation, and percent decoding
into `runtime/prelude.ts` as `__topaz_url_file_url_to_path(url)`. Lower imported
`fileURLToPath(url)` to that stable prelude symbol and remove
`topaz_url_file_url_to_path(...)` from the runtime header and substrate
inventory.

Rejected alternatives: exposing the `__topaz_*` helpers to user source was
rejected because they are migration affordances, not language APIs; using
`String.fromCharCode(...)` for percent bytes was rejected because it remains
ASCII-only; moving `topaz_runtime_module_url()` was rejected because executable
path lookup, `realpath`, platform conditionals, and caching are host substrate.

## Implementation

- `src/codegen.ts` accepts the two intrinsic calls only when
  `sf.isInternalModule && sf.stableModuleId === "runtime_prelude"`, and routes
  `fileURLToPath(url)` through
  `requireInternalPreludeFunctionCName("__topaz_url_file_url_to_path", ...)`.
- `runtime/prelude.ts` implements URL path parsing and byte-preserving percent
  decode with `Array<number>` plus `__topaz_string_from_byte_codes(...)`.
- `runtime/runtime.h` adds `topaz_panic(...)` and
  `topaz_string_from_byte_codes(...)`, removes `topaz_url_file_url_to_path(...)`,
  and keeps `topaz_runtime_module_url()`.
- `scripts/check-runtime-substrate.mjs` classifies the two new substrate helpers
  and drops the old URL helper inventory entry.
- `src/runtime_header.ts` and `src/runtime_prelude.ts` are regenerated from the
  runtime sources.

## Consequences

- **Accepted**: `node:url.fileURLToPath(url)` keeps its public call shape and
  diagnostics while its pure parse/decode logic is Topaz-subset TS.
- **Accepted**: `%00` through `%ff` percent escapes are preserved as bytes.
- **Regression**: `node_url_basic`, `runtime_prelude_file_url`,
  `runtime_prelude_panic_hidden_fail`, and
  `runtime_prelude_byte_codes_hidden_fail` lock the migration boundary.
- **Scope outside**: `import.meta.url` / `topaz_runtime_module_url()` and
  unrelated fs/process/path/console/container substrate stay unchanged.
