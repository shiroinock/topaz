# 0373 - console boolean prelude IO

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.46

## Context

ADR [0365](./0365-runtime-prelude-boolean-stringification.md) moved
compiler-owned boolean stringification to the internal runtime prelude helper
`__topaz_boolean_to_string(...)`, while direct boolean console IO stayed on
dedicated C helpers. ADR
[0372](./0372-runtime-substrate-inventory-check.md) then made the remaining C
substrate inventory-gated, so duplicate formatting helpers should be removed
when a stable prelude route already exists.

## Decision

Route `console.log(boolean)`, `console.error(boolean)`, and
`console.warn(boolean)` through the stable internal
`__topaz_boolean_to_string(...)` prelude symbol, then pass the resulting
`topaz_string` to the existing string console IO substrate helper for the same
stream. Remove the dedicated C boolean console helpers from the embedded runtime
header and substrate inventory.

Rejected alternatives: keeping console boolean IO in C was rejected because it
duplicates already migrated boolean stringification; moving string IO itself to
Topaz was rejected because stdout/stderr writes are host IO substrate; adding a
public `boolean.toString()` surface was rejected as unrelated language surface;
changing console newline or stream semantics was rejected because behavior must
remain unchanged.

## Implementation

- `src/codegen.ts:9079` keeps the existing console arity/type validation, but the
  boolean branch now emits
  `topaz_console_<stream>_string(topaz_fn_runtime_prelude___topaz_boolean_to_string(...))`.
- `runtime/runtime.h:647` now flows directly from parse helpers to number
  formatting; `topaz_console_log_boolean`, `topaz_console_error_boolean`, and
  `topaz_console_warn_boolean` are removed, and `src/runtime_header.ts` is
  regenerated from that header.
- `scripts/check-runtime-substrate.mjs:184` keeps
  `topaz_console_{log,error,warn}_string` classified as host IO substrate after
  removing the three stale boolean console inventory entries.
- `tests/smoke.sh:252` adds `runtime_prelude_console_boolean`, which checks the
  generated C uses the stable prelude symbol, rejects old boolean console helper
  call sites or definitions, compiles the C, and verifies stdout/stderr output.

## Consequences

- **Accepted**: console boolean output still prints `true` / `false` with the
  same stdout/stderr and newline behavior.
- **Accepted**: the C runtime substrate is smaller, and the inventory check will
  fail if the removed boolean console helpers reappear unclassified.
- **Rejected**: console diagnostics, number/string/bigint console lowering, and
  the hidden runtime prelude import surface are unchanged.
- **Regression**: `runtime_prelude_console_boolean`,
  `runtime_prelude_boolean_to_string`, `runtime_prelude_boolean_to_string_hidden_fail`,
  `boolean_print`, `generic_fn`, and `process_io` cover the public and internal
  paths alongside the full smoke suite.
- **Scope outside**: no public `boolean.toString()`, no migration of string IO
  substrate, and no broader runtime helper migration.
