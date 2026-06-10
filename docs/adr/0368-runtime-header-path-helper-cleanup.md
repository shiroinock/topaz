# 0368 - runtime header path helper cleanup

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.41

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) split the runtime into a tiny
C substrate plus an internal Topaz runtime prelude. ADRs
[0362](./0362-runtime-prelude-path-extname.md),
[0363](./0363-runtime-prelude-path-dirname.md),
[0364](./0364-runtime-prelude-path-basename.md), and
[0367](./0367-runtime-prelude-path-join.md) migrated `extname`, `dirname`,
`basename`, and `join` to prelude helpers but deliberately left C helper
removal as scoped cleanup.

The embedded runtime header is part of generated C and the release compiler
artifact. Leaving unused path helper definitions in that header increases every
emitted C file and blurs the substrate boundary after codegen no longer targets
those helpers.

## Decision

Delete only the migrated `topaz_path_dirname`, `topaz_path_basename`,
`topaz_path_basename_ext`, `topaz_path_extname`, and `topaz_path_join` C helper
definitions from `runtime/runtime.h`, then regenerate `src/runtime_header.ts`.
Keep `topaz_path_resolve` and `topaz_path_normalize_string` in C because
`resolve(...segments)` still owns the host `getcwd()` fallback and depends on
the C normalization routine.

Rejected alternatives: migrating `resolve(...segments)` now was rejected
because it still crosses the host path boundary; removing
`topaz_path_normalize_string` was rejected because `topaz_path_resolve` calls
it; migrating string allocation primitives was rejected because they need
explicit string-buffer intrinsics first; keeping all old path helpers was
rejected because the release compiler still embeds the stale definitions.

## Implementation

- `runtime/runtime.h:637` keeps the resolve substrate comment and
  `topaz_path_normalize_string(...)` / `topaz_path_resolve(...)`, while the
  migrated helper definitions are removed from the surrounding header.
- `src/runtime_header.ts:1` is regenerated from the smaller header so release
  and normal generated C embed the same substrate.
- `src/codegen.ts:9232` updates the stale `join` comment to describe the
  runtime prelude array packaging instead of the removed `topaz_path_join`
  lowering.
- `tests/smoke.sh:384` keeps the `topaz_path_resolve(` substrate probe and adds
  an emitted-C header check that rejects removed static inline path definitions.
- `docs/runtime-ts-migration.md:90` records that the migrated path helper C
  definitions are gone while `resolve` and normalization remain substrate code.

## Consequences

- **Accepted**: generated programs still use runtime prelude symbols for
  `dirname`, `basename`, `extname`, and `join`.
- **Accepted**: generated programs still use `topaz_path_resolve(...)` for the
  host-bound `resolve(...segments)` path.
- **Accepted**: embedded runtime headers no longer contain the migrated static
  inline path helper definitions.
- **Rejected**: no `resolve` migration, no public runtime prelude import API, no
  Windows path semantics, and no filesystem/process migration.
- **Regression**: `runtime_header_path_helper_cleanup` checks the embedded C
  header boundary; existing `runtime_prelude_path_extname`,
  `runtime_prelude_path_dirname`, `runtime_prelude_path_basename`,
  `runtime_prelude_path_join`, `runtime_substrate_path_resolve`,
  `node_path_basic`, `node_path_basename`, `node_path_extname`,
  `node_path_join`, and `std_path_basic` keep behavior unchanged alongside the
  full smoke suite.
