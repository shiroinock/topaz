# 0364 - runtime prelude path basename

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.37

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny C substrate plus
internal Topaz runtime prelude split, and ADR
[0360](./0360-substrate-backed-prelude-string-allocation.md) accepted pure
allocation clients that delegate final string allocation to compiler-owned
primitives. ADR [0362](./0362-runtime-prelude-path-extname.md) and ADR
[0363](./0363-runtime-prelude-path-dirname.md) already proved the path-helper
prelude lane for `extname(path)` and `dirname(path)`.

`node:path` / `std/path` `basename(path, ext?)` is the next path helper on that
lane. It has the same public API and diagnostics as before, but internally has
two call targets: one for the last-segment scan and one for suffix stripping.

## Decision

Move imported `basename(path, ext?)` lowering to two stable internal prelude
helpers, `__topaz_path_basename(path)` and
`__topaz_path_basename_ext(path, ext)`. Translate the existing C right-to-left
scan and suffix-match state machine into Topaz-subset TS, delegate final
substring allocation to `path.slice(start, end)`, regenerate
`src/runtime_prelude.ts`, and keep `runtime/runtime.h` unchanged for now.

Rejected alternatives: one optional-param prelude helper was rejected because
two explicit call targets mirror the existing C helpers and keep generated C
names stable; moving `join` or `resolve` in the same phase was rejected because
they require varargs and path-normalization boundaries; removing the C helpers
immediately was rejected because substrate cleanup is a separate concern.

## Implementation

- `runtime/prelude.ts:98` adds `__topaz_path_basename(...)` and
  `__topaz_path_basename_ext(...)`, preserving the previous slash scan,
  full-path suffix equality check, and `start === end` fallback.
- `src/runtime_prelude.ts:6` embeds the regenerated prelude source for normal
  and release builds.
- `src/codegen.ts:10318` keeps the existing `basename` arity/path/ext type
  diagnostics, but now resolves one- and two-argument calls through stable
  internal prelude symbols instead of direct C helper calls.
- `tests/smoke.sh:280` adds emitted-C coverage for both generated symbols, and
  `tests/smoke.sh:449` proves user code still cannot resolve either internal
  helper name.
- `docs/runtime-ts-migration.md:80` and `MEMO.md:278` record `basename` as the
  next allocation-client path helper on the runtime prelude lane.

## Consequences

- **Accepted**: generated C for imported `basename(path)` and
  `basename(path, ext)` now calls stable internal Topaz prelude helpers.
- **Accepted**: public `node:path` / `std/path` behavior and diagnostics remain
  unchanged, including arity/type/as-value failures and `std_path_basic`.
- **Accepted**: final substring allocation still flows through the existing
  `slice` substrate primitive.
- **Rejected**: user code still cannot resolve `__topaz_path_basename` or
  `__topaz_path_basename_ext`, and `runtime/runtime.h` is intentionally not
  removed, split, or shrunk in this phase.
- **Regression**: `runtime_prelude_path_basename`,
  `runtime_prelude_path_basename_hidden_fail`,
  `runtime_prelude_path_basename_ext_hidden_fail`, `node_path_basename`,
  `node_path_basename_arity_fail`, `node_path_basename_path_type_fail`,
  `node_path_basename_ext_type_fail`, `node_path_basename_as_value_fail`, and
  `std_path_basic` lock the behavior alongside the full smoke suite.
- **Scope outside**: no migration of `join`, `resolve`, path normalization,
  filesystem/process helpers, string allocation primitives, public prelude API,
  release tags, or GitHub publishing.
