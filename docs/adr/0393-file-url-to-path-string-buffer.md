# 0393 - fileURLToPath string-buffer migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.66

## Context

ADR [0392](./0392-string-slice-string-buffer.md) moved slice to the
string-buffer byte-push path. `docs/runtime-ts-migration.md` leaves
fileURLToPath as the remaining byte-code materialization client before raw byte
reads and old boundary cleanup. fileURLToPath is the next allocation client
because its pure URL parsing and percent decode already live in the runtime
prelude and only the decoded-byte materialization still uses the old bridge.

## Decision

Migrate only `runtime/prelude.ts`
`__topaz_url_file_url_to_path(url)` to allocate a `StringBuffer` with
conservative capacity `url.length`, push decoded percent bytes or ordinary URL
bytes with `__topaz_string_buffer_push_byte(...)`, and materialize through
`__topaz_string_buffer_to_string(buffer)`. Preserve public
`node:url.fileURLToPath(url)` lowering, `import.meta.url` behavior, diagnostics,
`file://` prefix validation, empty or `localhost` host handling, absolute path
validation, percent-decoding panic behavior, and `topaz_runtime_module_url()`.
Rejected alternatives: migrating `charCodeAt`, raw byte reads, or old
byte-code substrate cleanup together was rejected because this phase should be
one reversible allocation-client step; adding a URL-specific C helper or
substring append helper was rejected because ADR [0389](./0389-string-buffer-intrinsic-substrate.md)
already established the compiler-owned `StringBuffer` family; removing
`topaz_runtime_module_url()` was rejected because executable path lookup,
`realpath`, platform conditionals, and process-lifetime caching remain host ABI
substrate.

## Implementation

- `runtime/prelude.ts:493` changes only
  `__topaz_url_file_url_to_path(url)` from the temporary `Array<number>` bridge
  to the string-buffer byte-push path.
- `src/runtime_prelude.ts` is regenerated from `runtime/prelude.ts`.
- `tests/smoke.sh:876` keeps the stable prelude symbol, old helper rejection,
  `topaz_runtime_module_url(...)` presence, and runtime output check, then
  extracts the generated fileURLToPath function body to require
  `topaz_string_buffer_` and reject `topaz_string_from_byte_codes(...)` inside
  that body.
- `docs/runtime-ts-migration.md` and `MEMO.md` record fileURLToPath as the next
  string-buffer allocation client after slice.

## Consequences

- **Accepted**: existing `examples/node_url_basic.ts` output remains unchanged,
  including `%00` through `%ff` byte preservation, while generated C now
  exercises `topaz_string_buffer_push_byte(...)` for decoded URL bytes.
- **Reject**: user source still cannot reference hidden prelude helpers, and
  fileURLToPath no longer materializes through
  `topaz_string_from_byte_codes(...)`.
- **Regression**: `runtime_prelude_file_url` checks scoped generated-C helper
  usage and preserves the existing `examples/node_url_basic.ts` output.
- **Scope outside**: charCodeAt, raw byte reads, old byte-code substrate
  cleanup, public URL lowering, diagnostics, manifest, doctor, check, explain,
  release workflow files, and `topaz_runtime_module_url()` are unchanged.
