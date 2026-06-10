# 0358 - runtime prelude startsWith

- **Status**: Accepted
- **Date**: 2026-06-10
- **Phase**: 3.31

## Context

ADR [0355](./0355-runtime-ts-prelude-boundary.md) fixed the substrate/prelude
split, and ADR [0357](./0357-embedded-runtime-prelude-skeleton.md) embedded an
internal `runtime_prelude` module with a stable C module id. The next step is
to prove that a real builtin helper can move onto that lane without changing
the public `String.prototype.startsWith(search)` surface, diagnostics, or
release-compiler workflow.

`startsWith` is the smallest safe migration slice: it returns `boolean`, does
not allocate, and can be expressed with existing Topaz-subset string length,
`charCodeAt`, numeric comparison, `while`, and early `return`. Allocation-heavy
helpers such as `slice` and `repeat` still need explicit string-buffer
intrinsics, and `endsWith` stays on the old C helper path in this phase.

## Decision

Add an internal prelude helper `__topaz_string_starts_with(s, search)` to
`runtime/prelude.ts`, regenerate `src/runtime_prelude.ts`, and lower only
`String.prototype.startsWith(search)` to that stable internal prelude symbol.
Keep the existing one-argument arity/type diagnostics unchanged, keep
`String.prototype.endsWith(search)` on `topaz_string_ends_with`, and resolve
internal prelude function symbols through one reusable codegen path so future
helper migrations and prelude init lookup share the same boundary.

Rejected alternatives: migrating `endsWith` in the same change was rejected
because the brief fixes scope to one helper; rewriting `runtime/runtime.h` or
splitting out the old C helper was rejected because this phase only changes the
builtin lowering target; exposing `runtime/prelude.ts` as a public import or
user-callable API was rejected because prelude modules remain compiler-owned
implementation.

## Implementation

- `runtime/prelude.ts:4` adds `__topaz_string_starts_with(...)` beside the
  existing no-op prelude init, and `src/runtime_prelude.ts:4` embeds the
  regenerated source for release/self-host builds.
- `src/codegen.ts:2068` adds reusable internal-prelude symbol resolution keyed
  to the stable `runtime_prelude` module id; `src/codegen.ts:2086` reuses it for
  prelude init lookup.
- `src/codegen.ts:9801` keeps the existing `startsWith` / `endsWith`
  diagnostics together, but only `startsWith` now lowers through
  `__topaz_string_starts_with`, while `endsWith` still calls the C substrate.
- `tests/smoke.sh:199` adds emitted-C coverage for
  `topaz_fn_runtime_prelude___topaz_string_starts_with`, and
  `tests/smoke.sh:359` adds a hidden-name failure for user code calling the
  internal helper directly.
- `docs/runtime-ts-migration.md:60` and `MEMO.md:272` record `startsWith` as
  the first helper migration and keep allocation/host helpers out of scope.

## Consequences

- **Accepted**: generated C for `String.prototype.startsWith(search)` now calls
  a stable internal Topaz prelude function instead of `topaz_string_starts_with`.
- **Accepted**: user-visible method behavior and existing arity/type diagnostics
  remain unchanged.
- **Rejected**: user code still cannot resolve `__topaz_string_starts_with` by
  name, and `endsWith` / allocation-heavy helpers stay on the C substrate path.
- **Regression**: `string_starts_ends_with`,
  `runtime_prelude_starts_with`, `string_starts_with_arity_fail`,
  `string_starts_with_arg_type_fail`, and
  `runtime_prelude_starts_with_hidden_fail` lock the behavior, alongside the
  existing full smoke suite and dedicated emitted-C prelude checks.
- **Scope outside**: no public prelude import API, no manifest/doctor/capability
  behavior, no release/tag publication, and no migration of `endsWith`,
  `trimStart`, `slice`, `repeat`, path helpers, BigInt, containers, filesystem,
  or process helpers.
