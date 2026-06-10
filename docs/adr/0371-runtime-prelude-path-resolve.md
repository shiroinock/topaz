# 0371 - runtime prelude path resolve

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.44

## Context

ADR [0367](./0367-runtime-prelude-path-join.md) moved `join(...segments)` to the
runtime prelude but kept `resolve(...segments)` in C because the implementation
owned the `getcwd()` fallback. ADR
[0368](./0368-runtime-header-path-helper-cleanup.md) likewise kept
`topaz_path_resolve` and `topaz_path_normalize_string` in the embedded runtime
header for that host-boundary reason.

That boundary is now narrow enough to split: the syscall fallback is host
substrate work, while right-to-left segment merging and POSIX normalization are
deterministic string/array logic already supported by the internal prelude.

## Decision

Add internal prelude helper
`__topaz_path_resolve_segments(segments: Array<string>, cwd: string): string`.
Retarget public imported `node:path` / `std/path` `resolve(...segments)` lowering
to package checked variadic arguments into `Array<string>`, pass
`topaz_process_cwd()` as the cwd fallback, and call the helper's stable
`runtime_prelude` C symbol. Delete the old C `topaz_path_resolve` and
`topaz_path_normalize_string` helpers after regenerating the embedded header.

Rejected alternatives: keeping all of `resolve` in C was rejected because only
cwd lookup is host-bound; moving `getcwd()` into prelude TS was rejected because
Topaz has no syscall intrinsic lane; inferring cwd from executable metadata was
rejected because `resolve` is current-working-directory based; migrating
fs/process/url helpers together was rejected as broader than this boundary;
changing public imports or diagnostics was rejected because this is a lowering
and runtime migration only.

## Implementation

- `runtime/prelude.ts:285` adds `__topaz_path_resolve_segments(...)`,
  preserving the old right-to-left scan, empty segment skip, cwd fallback,
  absolute prefix, and `"."` fallback behavior.
- `runtime/runtime.h:601` adds `topaz_process_cwd()` as the remaining C cwd
  substrate and removes `topaz_path_resolve` /
  `topaz_path_normalize_string`.
- `src/codegen.ts:10270` keeps the existing `resolve` argument validation,
  evaluates each segment once into an internal array, and calls the stable
  prelude symbol with `topaz_process_cwd()`.
- `src/runtime_prelude.ts:6` and `src/runtime_header.ts:1` are regenerated from
  the runtime sources.
- `tests/smoke.sh:404` replaces the old substrate probe with
  `runtime_prelude_path_resolve`, which requires the prelude symbol and cwd
  helper, rejects the old call site and definitions, compiles and runs
  `node_path_basic`.

## Consequences

- **Accepted**: `node_path_basic` and `std_path_basic` keep their existing POSIX
  `resolve` behavior, including relative segment fallback through cwd.
- **Accepted**: generated C contains
  `topaz_fn_runtime_prelude___topaz_path_resolve_segments` and
  `topaz_process_cwd()`, and no longer calls `topaz_path_resolve(...)`.
- **Rejected**: `resolve()` arity diagnostics, non-string segment diagnostics,
  bare value use, Windows path semantics, and public runtime prelude imports
  remain unchanged.
- **Regression**: `runtime_prelude_path_resolve`,
  `runtime_prelude_path_resolve_hidden_fail`, `node_path_basic`,
  `node_path_resolve_arity_fail`, `node_path_resolve_type_fail`,
  `node_path_as_value_fail`, and `std_path_basic` lock the migration boundary
  alongside the full smoke suite.
- **Scope outside**: no filesystem/process/url migration and no new host
  intrinsic surface.
