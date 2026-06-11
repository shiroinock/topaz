# 0458 - string eq container prelude bridge

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.39

## Context

Phase 4.38 added per-symbol substrate detail in ADR
[0457](./0457-runtime-substrate-detail-report.md). That report identified
`topaz_string_eq` as pure-looking but still tied to Map/Set macro equality.
ADR [0366](./0366-runtime-prelude-string-equality.md) already moved ordinary
compiler string equality to the internal `__topaz_string_eq` runtime prelude
helper, while ADR [0413](./0413-container-monomorph-substrate-policy.md) kept
container equality in the C substrate until a container monomorphization design
replaces the macro family.

## Decision

Keep `topaz_string_eq(topaz_string a, topaz_string b)` as the C ABI bridge for
container macros, but delegate its algorithm to the stable runtime prelude
symbol through a forward declaration of
`topaz_fn_runtime_prelude___topaz_string_eq(...)`. Rejected alternatives:
removing `topaz_string_eq` would break Map/Set and generated container
monomorph equality-function tokens; rewriting `TOPAZ_MAP_DEFINE` /
`TOPAZ_SET_DEFINE` would cross into the future container backend design;
retargeting only scalar preexpanded macros would split string-key equality
ownership; moving hashing, SameValueZero number equality, storage, slot state,
or host/runtime allocation helpers is outside this bridge phase.

## Implementation

- `runtime/runtime.h:220` declares the generated runtime prelude string
  equality symbol after `topaz_string` is defined and before the bridge body.
- `runtime/runtime.h:222` changes `topaz_string_eq(...)` to return
  `topaz_fn_runtime_prelude___topaz_string_eq(a, b)`.
- `src/runtime_header.ts:1` is regenerated from `runtime/runtime.h` so the
  embedded header carries the same forward declaration and bridge body.
- `scripts/check-runtime-substrate.mjs:210` keeps `topaz_string_eq` in
  `container-monomorph-boundary` while naming it as a Map/Set macro equality
  C bridge whose algorithm is owned by the runtime prelude.
- `tests/smoke.sh:2233` keeps the generated-C Map/Set macro token checks and
  adds static checks for declaration order, prelude delegation, old `memcmp`
  removal, and substrate-detail wording.
- `docs/runtime-ts-migration.md:207` documents the Phase 4.39 bridge under the
  container monomorph policy.

## Consequences

- **Accepted**: runtime behavior and container representation are unchanged.
- **Accepted**: the `container-monomorph-boundary` lane count remains 13.
- **Accepted**: string equality now has one TypeScript prelude algorithm for
  ordinary compiler equality and Map/Set string-key equality.
- **Rejected**: `runtime/runtime.h` is no longer standalone for generated
  programs that use string-key container equality; it relies on loader-injected
  runtime prelude output for the matching generated C definition.
- **Regression**: `pnpm run check:runtime-header`,
  `pnpm run check:runtime-substrate -- --details`, `pnpm run build`, and
  `pnpm test`.
- **Scope outside**: Array/Map/Set macro replacement, generated container
  representation changes, hashing, SameValueZero number equality, public
  helper exposure, release flow, and CLI behavior.
