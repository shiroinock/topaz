# 0375 - console warn string wrapper cleanup

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.48

## Context

ADR [0373](./0373-console-boolean-prelude-io.md) and ADR
[0374](./0374-numeric-console-string-substrate.md) routed boolean, number, and
BigInt console IO through stringification plus the existing string console IO
substrate. After those phases, `topaz_console_warn_string(...)` was the only
console helper whose body only delegated to another console helper,
`topaz_console_error_string(...)`.

## Decision

Lower `console.warn(...)` directly to `topaz_console_error_string(...)` for all
accepted argument types and remove the duplicate `topaz_console_warn_string`
helper from the runtime header, embedded runtime header, and substrate
inventory.

Rejected alternatives: keeping `topaz_console_warn_string(...)` was rejected
because it is a pure stderr wrapper with no independent behavior; moving all
console IO to Topaz was rejected because stdout/stderr writes are host IO
substrate; emitting stream writes directly from codegen was rejected because it
would duplicate newline handling; changing diagnostics or accepted argument
types was rejected because this phase is substrate cleanup only.

## Implementation

- `src/codegen.ts:9082` keeps `console.warn` validation and diagnostics under
  the public method name, but maps non-`log` console methods to the stderr
  string helper family.
- `runtime/runtime.h:415` keeps `topaz_console_log_string(...)` and
  `topaz_console_error_string(...)`; the duplicate warn string wrapper is
  removed, and `src/runtime_header.ts` is regenerated from the header.
- `scripts/check-runtime-substrate.mjs:184` removes the stale warn wrapper from
  the substrate inventory while keeping the stdout/stderr string IO helpers.
- `tests/smoke.sh:339` adds `runtime_console_warn_string`, which checks
  generated C uses `topaz_console_error_string(...)`, rejects any
  `topaz_console_warn_string` call site or definition, compiles the program,
  and verifies empty stdout plus newline-terminated stderr output.

## Consequences

- **Accepted**: `console.warn(string | boolean | number | bigint)` keeps the
  same stderr destination, newline behavior, and stringification behavior.
- **Accepted**: `console.warn` arity/type diagnostics still mention
  `console.warn` because validation remains method-name aware.
- **Accepted**: the C console substrate shrinks by one helper and the inventory
  check will fail if the stale wrapper returns unclassified.
- **Rejected**: accepted console argument types, stdout/stderr routing,
  stringification helpers, and `console.log` / `console.error` lowering are
  unchanged.
- **Regression**: `runtime_console_warn_string`,
  `runtime_prelude_console_boolean`, `runtime_numeric_console_string`, and the
  existing console fail cases cover generated C, output behavior, and
  diagnostics.
- **Scope outside**: no migration of stdout/stderr string IO, no broader
  runtime helper cleanup, and no file/path/string/BigInt/container migration.
