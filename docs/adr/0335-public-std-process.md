# 0335 - public std/process

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.7

## Context

[0315](./0315-std-process-api-names.md) fixed the public `std/process`
names, and [0026](./0026-process-console-builtins.md) fixed the runtime
semantics for synthetic `process.*` and `console.error` helpers. The Phase 3
single-binary MVP needs public process and stdio imports before package lookup
and user-facing UX gates, while the compiler source still keeps its synthetic
compatibility surface.

## Decision

Add `std/process` public descriptors for `argv`, `exit`, `writeStdout`,
`writeStderr`, and `writeError`, mapping them to the same semantic builtins and
effect atoms as the synthetic compatibility surface. Codegen keeps the existing
syntactic shortcut model used by `std/fs` and `std/path`: public helper calls
are recognized by their bare names, `argv` value reads fall back to
`topaz_process_argv()` only when normal local/captured/top-level lookup fails,
and runtime lowering reuses the existing process/console emit helpers.
`writeError` is string-only at the public surface, but lowers to
`topaz_console_error_string` so it keeps the line-oriented stderr behavior.

Rejected alternatives: full import-provenance tracking was rejected because it
is broader than the current stdlib descriptor model; adding a first-class
`process` object or namespace/default imports was rejected by
[0315](./0315-std-process-api-names.md); making `writeError` a raw stderr write
was rejected because the public API intentionally names the existing
line-oriented `console.error` capability.

## Implementation

- `src/builtin_descriptors.ts:38` adds public process explanation text and
  `src/builtin_descriptors.ts:116` adds the five `std/process` descriptors.
- `src/codegen.ts:4118` accepts bare `exit`, `writeStdout`, `writeStderr`, and
  `writeError` in void-expression inference for expression-bodied arrows.
- `src/codegen.ts:7827` and `src/codegen.ts:10644` add unresolved bare `argv`
  value reads after normal binding and top-level function lookup, preserving
  local shadowing.
- `src/codegen.ts:8865` factors console lowering, while `src/codegen.ts:9031`
  lowers the public process helper calls to the existing process/stdio runtime
  paths.
- `src/codegen.ts:9897` keeps public `writeError` string-only and lowers it to
  the existing newline-appending stderr helper.
- `src/codegen.ts:11380` rejects value use of the public process helper calls.
- `examples/std_process_basic.ts:4` covers the public import surface, argv
  array behavior, raw stdout writes, stderr helpers, local `argv` shadowing,
  and `exit(0)` termination.
- `tests/smoke.sh:542` adds the positive regression and five fail cases.
- `MEMO.md:261` marks Phase 3.7 complete and points to this ADR.

## Consequences

- **Accepted**: public Topaz code can use `std/process` without relying on
  Node-shaped synthetic globals.
- **Accepted**: compatibility `process.*` and `console.error` behavior remains
  unchanged.
- **Rejected**: unknown `std/process` names fail through stdlib loader
  validation; bad `exit` / stdio argument types and helper value use are still
  rejected by codegen.
- **Regression**: `std_process_basic`,
  `std_process_unknown_named_import_fail`, `std_process_exit_type_fail`,
  `std_process_write_stdout_type_fail`, `std_process_write_error_type_fail`,
  and `std_process_write_error_as_value_fail` cover the new surface.
- **Scope out**: environment variables, stdin, cwd, pid, signals, spawn, URL,
  package lookup, manifest/capability enforcement, and import-provenance
  binding remain follow-up work.
