# 0459 - boolean container prelude bridge

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.40

## Context

Phase 4.39 proved a bridge pattern for `topaz_string_eq` without rewriting
container macros. The remaining boolean Map/Set hash and equality helpers are
exact, scalar, and small enough to use the same pattern while keeping ADR
[0413](./0413-container-monomorph-substrate-policy.md)'s container macro
boundary intact.

## Decision

Add hidden runtime prelude helpers `__topaz_boolean_hash(value)` and
`__topaz_boolean_key_eq(a, b)`, keep `topaz_hash_boolean(...)` and
`topaz_key_eq_boolean(...)` as the C ABI hook names passed to
`TOPAZ_MAP_DEFINE(...)` / `TOPAZ_SET_DEFINE(...)`, and delegate their bodies to
the generated prelude symbols. Rejected alternatives: removing the C helper
names would break container macro function-token wiring; bridging number hash
or number equality would mix in SameValueZero, NaN, and `-0/+0` policy that
belongs to the C substrate; bridging string hashing requires an explicit
integer/hash representation decision; rewriting container macros or generated
container representation is future backend work.

## Implementation

- `runtime/prelude.ts:9` adds the two hidden boolean helper algorithms.
- `runtime/runtime.h:785` declares the generated boolean prelude symbols before
  the container hash/equality bridge bodies.
- `runtime/runtime.h:788` delegates `topaz_hash_boolean(...)` through
  `topaz_fn_runtime_prelude___topaz_boolean_hash(...)` with a `size_t` cast.
- `runtime/runtime.h:806` delegates `topaz_key_eq_boolean(...)` through
  `topaz_fn_runtime_prelude___topaz_boolean_key_eq(...)`.
- `src/runtime_prelude.ts:1` and `src/runtime_header.ts:1` are regenerated from
  the runtime sources.
- `scripts/check-runtime-substrate.mjs:374` keeps both boolean helpers in
  `container-monomorph-boundary` while identifying them as runtime prelude C
  bridges.
- `tests/smoke.sh:2242` extends the generated-C container contract to check
  boolean macro tokens, declaration ordering, bridge delegation, stale inline
  algorithms, generated prelude definitions, substrate detail wording, and
  hidden-helper user-scope rejection.

## Consequences

- **Accepted**: runtime behavior and container representation are unchanged.
- **Accepted**: the `container-monomorph-boundary` lane count remains 13.
- **Accepted**: boolean key hashing/equality algorithms are now owned by the
  TypeScript runtime prelude while preserving container macro ABI tokens.
- **Rejected**: number hashing/equality, string hashing, pointer/reference
  hashing/equality, and full container monomorph replacement remain C substrate
  or future backend work.
- **Regression**: `pnpm run check:runtime-prelude`,
  `pnpm run check:runtime-header`,
  `pnpm run check:runtime-substrate -- --details`, `pnpm run build`, and
  `pnpm test`.
