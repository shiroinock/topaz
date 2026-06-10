# 0376 - console line IO wrapper cleanup

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.49

## Context

ADR [0373](./0373-console-boolean-prelude-io.md), ADR
[0374](./0374-numeric-console-string-substrate.md), and ADR
[0375](./0375-console-warn-string-wrapper-cleanup.md) routed console boolean,
number, BigInt, and warn output through shared stringification and string IO
paths. After those phases, `topaz_console_log_string(...)` and
`topaz_console_error_string(...)` only wrapped raw stdout/stderr writes plus a
newline.

## Decision

Remove the remaining console line wrappers from `runtime/runtime.h`. Lower
`console.log(...)`, `console.error(...)`, `console.warn(...)`, and public
`std/process.writeError(...)` as raw `topaz_stdout_write(...)` or
`topaz_stderr_write(...)` of the formatted value followed by the same raw write
of a compiler-owned `"\n"` string literal.

Rejected alternatives: keeping the line wrappers was rejected because they no
longer own formatting or stream selection; moving raw stdout/stderr writes into
Topaz was rejected because those helpers are host IO substrate; changing
`writeError` into a raw stderr write was rejected because ADR
[0335](./0335-public-std-process.md) made it the public line-oriented stderr
helper.

## Implementation

- `src/codegen.ts:9079` adds a shared line-write emitter and routes accepted
  console arguments through existing boolean, number, BigInt, or string
  formatting before appending the compiler-owned newline string.
- `src/codegen.ts:10237` keeps `writeError(s)` string-only but lowers it to the
  same stderr line composition as `console.error(...)`.
- `runtime/runtime.h` removes `topaz_console_log_string(...)` and
  `topaz_console_error_string(...)`; `src/runtime_header.ts` is regenerated
  from that header.
- `scripts/check-runtime-substrate.mjs` removes both stale wrapper symbols from
  the substrate inventory while keeping `topaz_stdout_write(...)` and
  `topaz_stderr_write(...)` classified as console IO substrate.
- `tests/smoke.sh` adds `runtime_console_line_io_wrappers`, which checks raw
  write substrate names, rejects stale wrapper names, compiles the generated C,
  and compares stdout/stderr byte-for-byte.

## Consequences

- **Accepted**: `console.log(string | boolean | number | bigint)` keeps one
  trailing newline on stdout.
- **Accepted**: `console.error(...)`, `console.warn(...)`, and
  `std/process.writeError(string)` keep one trailing newline on stderr.
- **Accepted**: `process.stdout.write` and `process.stderr.write` remain raw
  no-newline writes.
- **Rejected**: console arity/type diagnostics, accepted argument types, and
  stringification helpers are unchanged.
- **Regression**: `runtime_console_line_io_wrappers`,
  `runtime_prelude_console_boolean`, `runtime_numeric_console_string`,
  `runtime_console_warn_string`, and existing console/process fail cases cover
  generated C, output behavior, and diagnostics.
- **Scope outside**: no migration of raw stdout/stderr substrate, no broader
  runtime helper cleanup, and no capability/host ABI work.
