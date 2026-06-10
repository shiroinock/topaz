# 0359 - runtime prelude endsWith

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.32

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the substrate/prelude
split, ADR [0357](./0357-embedded-runtime-prelude-skeleton.md) embedded the
internal `runtime_prelude` module with a stable C module id, and ADR
[0358](./0358-runtime-prelude-starts-with.md) proved the lane with
`String.prototype.startsWith(search)`. The next safe migration is
`endsWith`: it returns `boolean`, does not allocate, and can be expressed with
existing Topaz-subset string length, `charCodeAt`, numeric arithmetic, `while`,
and early `return`.

The phase brief fixes scope to `String.prototype.endsWith(search)` only.
Allocation-heavy helpers such as `slice`, `repeat`, and `trimStart`, plus
path/host/container helpers, still need explicit substrate support or later
design work.

## Decision

Add an internal prelude helper `__topaz_string_ends_with(s, search)` to
`runtime/prelude.ts`, regenerate `src/runtime_prelude.ts`, and lower only
`String.prototype.endsWith(search)` to that stable internal prelude symbol.
Keep existing one-argument arity/type diagnostics unchanged, keep
`String.prototype.startsWith(search)` on its existing prelude helper, and keep
the C substrate intact in `runtime/runtime.h`.

Rejected alternatives: migrating additional string helpers in the same phase
was rejected because the brief fixes scope to `endsWith`; exposing
`runtime/prelude.ts` as a public import or callable user API was rejected
because internal prelude symbols remain compiler-owned; removing or splitting
`runtime/runtime.h` was rejected because this phase only changes builtin
lowering targets.

## Implementation

- `runtime/prelude.ts:14` adds `__topaz_string_ends_with(...)`, and
  `src/runtime_prelude.ts:4` embeds the regenerated source for release and
  self-host builds.
- `src/codegen.ts:9802` keeps shared `startsWith` / `endsWith` diagnostics, but
  now resolves both methods through the stable internal prelude symbol lookup
  path instead of calling `topaz_string_ends_with` directly for suffix checks.
- `tests/smoke.sh:215` adds emitted-C coverage for
  `topaz_fn_runtime_prelude___topaz_string_ends_with`, and
  `tests/smoke.sh:376` adds a hidden-name failure for user code calling the
  internal helper directly.
- `docs/runtime-ts-migration.md:63` and `MEMO.md:273` record both string
  predicate helpers on the runtime prelude lane.

## Consequences

- **Accepted**: generated C for `String.prototype.endsWith(search)` now calls a
  stable internal Topaz prelude function instead of `topaz_string_ends_with`.
- **Accepted**: user-visible method behavior and existing arity/type
  diagnostics remain unchanged.
- **Rejected**: user code still cannot resolve `__topaz_string_ends_with` by
  name, and allocation-heavy helpers remain on the C substrate path.
- **Regression**: `string_starts_ends_with`, `runtime_prelude_starts_with`,
  `runtime_prelude_ends_with`, `string_ends_with_arity_fail`,
  `string_ends_with_arg_type_fail`, and
  `runtime_prelude_ends_with_hidden_fail` lock the behavior, alongside the
  existing full smoke suite and release checks.
- **Scope outside**: no migration of `trimStart`, `slice`, `repeat`, path
  helpers, BigInt, containers, filesystem, or process helpers; no public
  prelude import API; no manifest/doctor/capability behavior; no release/tag
  publication.
