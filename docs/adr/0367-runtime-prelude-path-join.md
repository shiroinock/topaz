# 0367 - runtime prelude path join

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.40

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny C substrate plus
internal Topaz runtime prelude split. ADR
[0360](./0360-substrate-backed-prelude-string-allocation.md) separated
allocation primitives from pure allocation clients, and ADR
[0364](./0364-runtime-prelude-path-basename.md) proved path scan helpers can
move to Topaz-subset TS while keeping public stdlib imports unchanged.

`join(...segments)` is the next pure `node:path` / `std/path` helper. Unlike
`extname`, `dirname`, and `basename`, its public API is variadic while runtime
prelude helpers have fixed signatures, so the call-site boundary is packaging
the already checked segments into an internal array.

## Decision

Add internal prelude helper
`__topaz_path_join_segments(segments: Array<string>): string` and retarget
public `join(...segments)` lowering to the helper's stable `runtime_prelude` C
symbol. Codegen keeps the user-visible variadic call shape and diagnostics,
evaluates each source argument exactly once into an internal `Array<string>`,
and passes that array to the prelude helper.

Rejected alternatives: migrating `resolve(...segments)` together with `join`
was rejected because `resolve` still owns the host `getcwd()` fallback boundary;
exposing an importable runtime prelude module was rejected because helpers stay
compiler-owned internals; keeping the C varargs join algorithm was rejected
because this phase moves the compiler-owned join algorithm out of the C path;
removing `topaz_path_join` from `runtime/runtime.h` was rejected as cleanup
outside this phase.

## Implementation

- `runtime/prelude.ts:181` adds `__topaz_path_normalize_string(...)` and
  `__topaz_path_join_segments(...)`, preserving the POSIX normalization behavior
  from the former C call path.
- `src/runtime_prelude.ts:6` embeds the regenerated prelude source for normal
  and release builds.
- `src/codegen.ts:10395` builds a statement-expression `Array<string>` for the
  checked `join` arguments, then calls the stable internal prelude symbol.
- `tests/smoke.sh:364` checks emitted C for
  `topaz_fn_runtime_prelude___topaz_path_join_segments`, rejects a
  `topaz_path_join(` call site, compiles and runs `node_path_join`, and keeps
  `topaz_path_resolve(` visible for the host-bound split.
- `tests/smoke.sh:544` keeps the hidden-name diagnostic for
  `__topaz_path_join_segments`.

## Consequences

- **Accepted**: `join()`, all-empty segments, ordinary POSIX normalization,
  leading slash, trailing slash, and leading relative `..` behavior remain
  observable through the existing `node_path_join` and `std_path_basic` cases.
- **Accepted**: the prelude lane now supports an array-parameter helper while
  preserving public variadic call sites.
- **Rejected**: non-string segment diagnostics and bare `join` value use remain
  unchanged, and user code still cannot resolve `__topaz_path_join_segments`.
- **Rejected**: `resolve(...segments)` and the old C helper stay in
  `runtime/runtime.h` until a cleanup or host-boundary phase explicitly scopes
  them.
- **Regression**: `runtime_prelude_path_join`,
  `runtime_substrate_path_resolve`, `runtime_prelude_path_join_hidden_fail`,
  `node_path_join`, `node_path_join_type_fail`, `node_path_join_as_value_fail`,
  and `std_path_basic` lock the migration boundary alongside the full smoke
  suite.
- **Scope outside**: no runtime header shrinkage, no importable prelude module,
  no `resolve` migration, and no Windows path semantics.
