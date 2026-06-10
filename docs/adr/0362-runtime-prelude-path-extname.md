# 0362 - runtime prelude path extname

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.35

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny C substrate plus
internal Topaz runtime prelude split, ADR
[0360](./0360-substrate-backed-prelude-string-allocation.md) accepted helpers
that delegate final string allocation to existing compiler-owned primitives,
and ADR [0361](./0361-runtime-prelude-trim-start.md) proved that pattern for
`String.prototype.trimStart()`. `node:path` / `std/path` `extname(path)` is the
first path helper candidate because it is a pure scan over one string and can
return through the existing `slice(start, end)` substrate primitive.

The phase brief fixes scope to `extname` only. `dirname`, `basename`, `resolve`,
`join`, path normalization, `slice`, `repeat`, concat, `String.fromCharCode`,
`charCodeAt`, filesystem/process helpers, BigInt, and containers stay on their
existing C/codegen paths.

## Decision

Add internal prelude helper `__topaz_path_extname(path)` to
`runtime/prelude.ts`, translate the existing C state machine with ASCII byte
codes `47` (`/`) and `46` (`.`), regenerate `src/runtime_prelude.ts`, and lower
only imported `extname(path)` to the stable internal prelude symbol. Keep the
one-string-argument diagnostics unchanged, keep `runtime/prelude.ts`
internal-only, and keep `runtime/runtime.h` intact.

Rejected alternatives: migrating other path helpers in the same change was
rejected because their normalization, varargs, or host-boundary needs require
separate decisions; exposing the runtime prelude as a public import API was
rejected because it remains compiler-owned; deleting `topaz_path_extname` from
`runtime/runtime.h` was rejected because header shrinkage is a later cleanup
choice, not part of this migration.

## Implementation

- `runtime/prelude.ts:38` adds `__topaz_path_extname(...)`, preserving the
  previous right-to-left state machine and delegating final allocation to
  `path.slice(startDot, end)`.
- `src/runtime_prelude.ts:6` embeds the regenerated prelude source for normal
  and release builds.
- `src/codegen.ts:10347` keeps the existing `extname` arity and path-type
  diagnostics, but now resolves `__topaz_path_extname` through the stable
  internal prelude symbol instead of calling `topaz_path_extname` directly.
- `tests/smoke.sh:247` adds emitted-C coverage for
  `topaz_fn_runtime_prelude___topaz_path_extname`, and `tests/smoke.sh:410`
  adds a hidden-name failure proving user code still cannot resolve
  `__topaz_path_extname`.
- `docs/runtime-ts-migration.md:79` and `MEMO.md:276` record `extname` as the
  first non-string-method helper on the runtime prelude lane.

## Consequences

- **Accepted**: generated C for imported `extname(path)` now calls a stable
  internal Topaz prelude helper rather than the old direct C helper.
- **Accepted**: public `node:path` / `std/path` behavior and diagnostics remain
  unchanged, including hidden bare `extname` value lookup.
- **Accepted**: final substring allocation still flows through the existing
  `slice` substrate primitive.
- **Rejected**: user code still cannot resolve `__topaz_path_extname` by name,
  and `runtime/runtime.h` is not removed, split, or shrunk in this phase.
- **Regression**: `node_path_extname`, `runtime_prelude_path_extname`,
  `node_path_extname_arity_fail`, `node_path_extname_type_fail`,
  `node_path_extname_as_value_fail`, and
  `runtime_prelude_path_extname_hidden_fail` lock the behavior alongside the
  full smoke suite and release checks.
- **Scope outside**: no migration of other path helpers, path normalization,
  string allocation primitives, filesystem/process helpers, BigInt,
  containers, public prelude API, manifest/doctor/capability behavior, release
  tags, or GitHub publishing.
