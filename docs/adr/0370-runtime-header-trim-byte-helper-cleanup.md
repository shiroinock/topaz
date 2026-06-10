# 0370 - runtime header trim byte helper cleanup

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.43

## Context

ADR [0361](./0361-runtime-prelude-trim-start.md) migrated
`String.prototype.trimStart()` scanning to the internal runtime prelude as
`__topaz_string_is_trim_start_code(...)` and
`__topaz_string_trim_start(...)`. ADR [0369](./0369-runtime-header-string-helper-cleanup.md)
then removed the old `topaz_string_trim_start(...)` C helper from the embedded
runtime header, but its private byte predicate remained in `runtime/runtime.h`
and therefore in every generated C file.

That leftover predicate has no caller after the prelude migration and blurs the
small C substrate boundary that the runtime-header cleanup phases are making
explicit.

## Decision

Delete only `topaz_string_is_trim_start_byte(...)` from `runtime/runtime.h`,
then regenerate `src/runtime_header.ts`. Keep the prelude trim helpers
unchanged and keep real C substrate helpers such as string equality,
allocation primitives, number/bigint stringification, console IO, path
resolve/normalization, container macros, exceptions, and arena allocation.

Rejected alternatives: migrating `slice`, `repeat`, concat, or
`String.fromCharCode(...)` was rejected because they remain string allocation
primitives; removing `topaz_string_eq` was rejected because C container
substrate still uses it for string keys; changing `resolve(...)` was rejected
because it still owns the host `getcwd()` boundary.

## Implementation

- `runtime/runtime.h:365` removes the stale byte predicate while retaining
  `topaz_string_eq` and the string allocation primitives around it.
- `src/runtime_header.ts:1` is regenerated from the smaller header so normal
  and release generated C embed the same substrate.
- `tests/smoke.sh:316` extends `runtime_prelude_trim_start` generated-C checks
  to reject the stale byte predicate alongside the removed old C `trimStart`
  helper while requiring the stable prelude symbol.
- `docs/runtime-ts-migration.md:100` and `MEMO.md:284` record the cleanup after
  the broader string-helper removal.

## Consequences

- **Accepted**: generated programs still lower `trimStart()` to
  `topaz_fn_runtime_prelude___topaz_string_trim_start`.
- **Accepted**: embedded runtime headers no longer contain the stale
  `topaz_string_is_trim_start_byte(...)` definition.
- **Accepted**: `__topaz_string_is_trim_start_code(...)` remains the sole trim
  scanning predicate.
- **Rejected**: no public behavior, diagnostics, hidden-helper access, or
  substrate allocation/path/container boundary changes.
- **Regression**: `runtime_prelude_trim_start` now checks the stale helper is
  absent, and `runtime_prelude_trim_start_hidden_fail` keeps the internal
  helper hidden from user code alongside the full smoke suite.
