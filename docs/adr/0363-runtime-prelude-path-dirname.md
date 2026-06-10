# 0363 - runtime prelude path dirname

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.36

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny C substrate plus
internal Topaz runtime prelude split, ADR
[0360](./0360-substrate-backed-prelude-string-allocation.md) accepted helpers
that delegate final string allocation to existing compiler-owned primitives,
and ADR [0362](./0362-runtime-prelude-path-extname.md) established the
path-helper migration pattern. `node:path` / `std/path` `dirname(path)` is the
next one-argument path scan helper: it strips a trailing slash run, finds the
previous separator, and returns either a literal or a final `slice(0, end)`.

The phase brief fixes scope to `dirname` only. `resolve`, `basename`,
`basename(path, ext)`, `extname`, `join`, path normalization, `slice`, `repeat`,
concat, `String.fromCharCode`, `charCodeAt`, filesystem/process helpers,
BigInt, and containers stay on their existing paths.

## Decision

Add internal prelude helper `__topaz_path_dirname(path)` to
`runtime/prelude.ts`, translate the existing C helper with ASCII byte code `47`
for `/`, regenerate `src/runtime_prelude.ts`, and lower only imported
`dirname(path)` to the stable internal prelude symbol. Keep arity/type
diagnostics, import rules, the hidden compiler-owned prelude boundary, and
`runtime/runtime.h` unchanged.

Rejected alternatives: migrating `resolve` or `join` normalization now was
rejected because varargs and path normalization need a separate boundary;
migrating `basename(path, ext)` now was rejected because the two-argument suffix
case is a different helper shape; exposing the runtime prelude as a public API
was rejected because it remains compiler-owned; deleting `topaz_path_dirname`
from `runtime/runtime.h` was rejected because header shrinkage is a later
cleanup choice, not part of this migration.

## Implementation

- `runtime/prelude.ts:75` adds `__topaz_path_dirname(...)`, preserving the
  previous right-to-left slash scan and delegating final allocation to
  `path.slice(0, end)`.
- `src/runtime_prelude.ts:6` embeds the regenerated prelude source for normal
  and release builds.
- `src/codegen.ts:10248` keeps the existing `dirname` arity and path-type
  diagnostics, but now resolves `__topaz_path_dirname` through the stable
  internal prelude symbol instead of calling `topaz_path_dirname` directly.
- `tests/smoke.sh:263` adds emitted-C coverage for
  `topaz_fn_runtime_prelude___topaz_path_dirname`, and `tests/smoke.sh:426`
  adds a hidden-name failure proving user code still cannot resolve
  `__topaz_path_dirname`.
- `docs/runtime-ts-migration.md:80` and `MEMO.md:277` record `dirname` as the
  second path helper on the runtime prelude lane.

## Consequences

- **Accepted**: generated C for imported `dirname(path)` now calls a stable
  internal Topaz prelude helper rather than the old direct C helper.
- **Accepted**: public `node:path` / `std/path` behavior and diagnostics remain
  unchanged, including existing arity/type failures and `resolve(dirname(...))`
  behavior.
- **Accepted**: final substring allocation still flows through the existing
  `slice` substrate primitive.
- **Rejected**: user code still cannot resolve `__topaz_path_dirname` by name,
  and `runtime/runtime.h` is not removed, split, or shrunk in this phase.
- **Regression**: `node_path_basic`, `std_path_basic`,
  `runtime_prelude_path_dirname`, `node_path_dirname_arity_fail`,
  `node_path_dirname_type_fail`, and
  `runtime_prelude_path_dirname_hidden_fail` lock the behavior alongside the
  full smoke suite and release checks.
- **Scope outside**: no migration of other path helpers, path normalization,
  string allocation primitives, filesystem/process helpers, BigInt,
  containers, public prelude API, manifest/doctor/capability behavior, release
  tags, or GitHub publishing.
