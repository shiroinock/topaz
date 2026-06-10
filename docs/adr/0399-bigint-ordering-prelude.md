# 0399 - bigint ordering prelude migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.72

## Context

ADR [0398](./0398-bigint-equality-prelude.md) moved public BigInt equality from
the C substrate to runtime prelude code backed by hidden limb-inspection
intrinsics. Ordering is the next public BigInt operator surface that only needs
sign, canonical zero behavior, limb length, and immutable limb reads; it does
not require BigInt result construction, decimal parsing, or formatting.

## Decision

Route public bigint `<` / `<=` / `>` / `>=` through runtime prelude
`__topaz_bigint_cmp(a, b)`, preserving the previous `-1` / `0` / `1` comparison
convention. The prelude helper compares signs first, returns equality for
canonical zero, compares absolute limb length, then walks limbs from most
significant to least significant and flips the result for negative operands.
Rejected alternatives: keeping `topaz_bigint_cmp(...)` in C was rejected because
ordering now has enough immutable inspection intrinsics to live in Topaz-subset
TS; migrating arithmetic was rejected because add/sub/mul still need fresh
result construction and carry/borrow loops; exposing `__topaz_bigint_cmp(...)`
to user modules was rejected because the helper remains compiler-owned runtime
machinery.

## Implementation

- `runtime/prelude.ts:55` adds `__topaz_bigint_cmp_abs(a, b)` and
  `__topaz_bigint_cmp(a, b)` using only `__topaz_bigint_sign`,
  `__topaz_bigint_limb_len`, and `__topaz_bigint_limb`.
- `src/codegen.ts:2115` adds a stable runtime prelude comparison emission
  helper, and `src/codegen.ts:8404` routes bigint ordering through it while
  leaving add/sub/mul on the existing C helpers.
- `runtime/runtime.h:225` removes standalone `topaz_bigint_cmp_abs(...)` and
  `topaz_bigint_cmp(...)`; `topaz_bigint_add(...)` keeps its internal absolute
  comparison locally so arithmetic behavior does not change.
- `scripts/check-runtime-substrate.mjs:139` removes both comparison helpers from
  the inventory, so `tests/smoke.sh:22` now asserts
  `needs-bigint-limb-intrinsics: 14` while keeping
  `bigint-limb-intrinsic-family: 8`.

## Consequences

- **Accepted**: bigint ordering now exercises Topaz-subset runtime prelude code
  for the public signed comparison surface while preserving observable output.
- **Rejected**: arithmetic, literal parsing, decimal formatting, allocation
  helpers, and result construction remain in the C substrate.
- **Regression**: `examples/bigint_ordering.ts` covers positive less-than,
  equal `<=` / `>=`, negative ordering, multi-limb ordering, and zero
  boundaries; `tests/smoke.sh:675` checks generated C uses
  `topaz_fn_runtime_prelude___topaz_bigint_cmp` and no standalone
  `topaz_bigint_cmp(...)` / `topaz_bigint_cmp_abs(...)`;
  `examples/runtime_prelude_bigint_cmp_hidden_fail.ts` keeps the helper hidden
  from user source.
- **Next**: a later BigInt migration can target a result-producing helper such
  as unary negation / copy-abs or a smaller arithmetic leaf once construction
  policy is fixed.
