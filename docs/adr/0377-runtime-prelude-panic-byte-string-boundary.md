# 0377 - runtime prelude panic byte string boundary

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.50

## Context

Runtime prelude migration has removed many pure path, string, and console
wrappers from `runtime/runtime.h`. The next attractive helper,
`topaz_url_file_url_to_path(...)`, mixes pure `file://` URL parsing with
precise abort diagnostics, arena allocation, and arbitrary byte string
construction. Existing Topaz strings are byte strings at runtime, but source
string literals and `String.fromCharCode(...)` intentionally stay
ASCII-limited, so percent decoding cannot be preserved by a direct rewrite.

## Decision

Do not migrate `fileURLToPath` as one large C-to-TS rewrite. Add two
compiler-owned, internal-prelude-only affordances first: `__topaz_panic(message:
string): never`, lowered to a tiny aborting C substrate helper, and
`__topaz_string_from_byte_codes(codes: Array<number>): string`, lowered to a
raw allocation helper that copies numeric byte codes into a Topaz string. Keep
both helpers hidden from user source like the existing `__topaz_*` prelude
helpers. After that substrate phase, move the `file://` prefix, optional empty
or `localhost` host, absolute path, and percent-decoding algorithm into
`runtime/prelude.ts`; lower imported `fileURLToPath(url)` to the stable internal
prelude symbol; then remove `topaz_url_file_url_to_path(...)` from
`runtime/runtime.h` and the substrate inventory. Keep
`topaz_runtime_module_url()` in C substrate because it depends on executable
path syscalls, `realpath`, platform conditionals, and a static process-lifetime
cache.

Rejected alternatives: migrating immediately with string concatenation and
`String.fromCharCode(...)` was rejected because ASCII-only construction cannot
preserve `%00` through `%ff`; making `__topaz_panic` public was rejected because
abort semantics are a migration affordance, not a language surface; using
`process.stderr.write(...)` plus `process.exit(1)` in the prelude was rejected
because current helpers abort and prelude internals should not depend on
synthetic user-facing process globals; moving `topaz_runtime_module_url()` with
`fileURLToPath` was rejected because it is host/syscall/cache substrate; adding
general unsafe pointer or byte-buffer APIs was rejected as outside this runtime
migration scope.

## Implementation

- `docs/runtime-ts-migration.md`: records the new panic and byte string
  boundary for a later `fileURLToPath` migration.
- `MEMO.md`: records this docs-only design slice as Phase 3.50.
- No compiler or runtime implementation files change in this phase.

## Consequences

- **Accepted**: a future `fileURLToPath` prelude helper may express parse and
  validation control flow in Topaz-subset TS.
- **Accepted**: runtime failure messages can remain precise and aborting
  through a tiny panic substrate.
- **Accepted**: percent-decoded paths can preserve arbitrary bytes through an
  internal byte-code-to-string allocation primitive.
- **Rejected**: no user-visible imports, globals, unsafe pointers, byte arrays,
  or behavior changes for `node:url.fileURLToPath` / `import.meta.url`.
- **Scope outside**: no migration of `topaz_runtime_module_url()`,
  filesystem/process/child_process host wrappers, or public byte APIs.
