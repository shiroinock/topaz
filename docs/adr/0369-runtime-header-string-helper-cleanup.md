# 0369 - runtime header string helper cleanup

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.42

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the tiny C substrate
plus internal Topaz runtime prelude split. ADRs
[0358](./0358-runtime-prelude-starts-with.md),
[0359](./0359-runtime-prelude-ends-with.md),
[0361](./0361-runtime-prelude-trim-start.md), and
[0365](./0365-runtime-prelude-boolean-stringification.md) migrated
`startsWith`, `endsWith`, `trimStart`, and compiler-owned boolean
stringification lowering to stable internal prelude helpers.

Phase 3.41 proved the cleanup pattern for migrated path helpers: once codegen
no longer targets an old C helper, the embedded runtime header can drop that
definition while keeping explicit substrate boundaries in C.

## Decision

Delete only the migrated `topaz_string_starts_with`,
`topaz_string_ends_with`, `topaz_string_trim_start`, and
`topaz_boolean_to_string` C helper definitions from `runtime/runtime.h`, then
regenerate `src/runtime_header.ts`. Keep the corresponding
`__topaz_string_starts_with`, `__topaz_string_ends_with`,
`__topaz_string_trim_start`, and `__topaz_boolean_to_string` internal prelude
helpers unchanged.

Rejected alternatives: removing `topaz_string_eq` was rejected because Map/Set
string keys still use it in C macro-generated containers; migrating string
allocation primitives was rejected because concat, slice, repeat, and
`String.fromCharCode(...)` still need explicit string-buffer intrinsics;
touching `resolve(...segments)` was rejected because its `getcwd()` fallback is
host-bound and belongs to a separate path-boundary phase.

## Implementation

- `runtime/runtime.h:365` keeps `topaz_string_eq` and allocation primitives but
  removes the migrated string-method C definitions from the embedded header
  substrate.
- `runtime/runtime.h:771` keeps console boolean IO helpers while removing the
  old non-IO boolean stringification helper.
- `src/runtime_header.ts:1` is regenerated from the smaller header so normal
  and release generated C embed the same substrate.
- `tests/smoke.sh:200` checks focused generated C for stable prelude symbols
  and rejects the removed migrated static inline definitions.
- `docs/runtime-ts-migration.md:97` and `MEMO.md:283` record the cleanup while
  preserving the remaining C substrate boundaries.

## Consequences

- **Accepted**: generated programs still call stable internal prelude symbols
  for `startsWith`, `endsWith`, `trimStart`, template boolean substitution, and
  `Array<boolean>.join(...)`.
- **Accepted**: embedded runtime headers no longer contain the migrated static
  inline string/scalar helper definitions.
- **Accepted**: Map/Set string key equality, string allocation primitives,
  number/bigint formatting, console boolean IO, and host-bound path helpers
  remain C substrate code.
- **Rejected**: no public prelude import API, no behavior change, and no broad
  runtime refactor beyond this cleanup.
- **Regression**: `runtime_prelude_starts_with`,
  `runtime_prelude_ends_with`, `runtime_prelude_trim_start`,
  `runtime_prelude_boolean_to_string`, and the existing hidden-helper fail
  cases lock the boundary alongside the full smoke suite.
