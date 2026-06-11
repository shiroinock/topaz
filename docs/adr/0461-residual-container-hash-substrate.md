# ADR 0461: Pin Residual Container Hash Substrate

## Status

Accepted

## Context

Phase 4.39 kept `topaz_string_eq(...)` as a Map/Set C ABI token while moving
the string equality algorithm to the runtime prelude. Phase 4.40 applied that
bridge pattern to boolean hash/equality, and Phase 4.41 applied it to number
SameValueZero equality. Those wins do not make the remaining hash helpers safe
runtime-prelude candidates: their behavior depends on C integer, pointer, and
`size_t` container hash ABI details that Topaz source does not yet model.

## Decision

Pin `topaz_hash_number(...)`, `topaz_hash_string(...)`, and
`topaz_hash_pointer(...)` as residual C substrate within
`container-monomorph-boundary` until a future hash/integer/pointer/container
backend decision replaces them as a unit. The checker detail report now names
the concrete blockers: number hashing owns `uint64_t` bit copying, `size_t`
mixing, canonical NaN handling, and `-0` normalization; string hashing owns
FNV-1a byte hashing with unsigned overflow and hash-order stability; pointer
hashing owns reference-identity pointer bits.

Rejected alternatives: moving `topaz_hash_string(...)` to a simplified numeric
prelude hash would risk bucket placement and observable Map/Set iteration
order; adding BigInt-returning or number-returning prelude hash helpers would
be a new hash representation design; moving `topaz_hash_pointer(...)` would
require a Topaz pointer value model; rewriting `TOPAZ_MAP_DEFINE(...)` /
`TOPAZ_SET_DEFINE(...)` or storage layout belongs to future compiler-owned
container monomorphization.

## Implementation

- `scripts/check-runtime-substrate.mjs:362` keeps all three helpers in
  `container-monomorph-boundary` while changing their `reason` / `next` detail
  text from generic container guidance to residual-hash-specific blockers.
- `tests/smoke.sh:888` extends the substrate detail inventory smoke with
  number/string/pointer hash fragments, and `tests/smoke.sh:2376` keeps the
  bridge details for `topaz_string_eq`, boolean helpers, and
  `topaz_key_eq_number` separate from the residual hash assertions.
- `docs/runtime-ts-migration.md:232` records why Phase 4.39-4.41 bridge wins do
  not imply helper-by-helper hash migration is safe.
- `MEMO.md:375` records the completed phase without changing the roadmap
  surface.

## Consequences

Runtime behavior, generated C container representation, Map/Set key equality,
hash algorithms, and iteration order are unchanged. The migration lane remains
`container-monomorph-boundary: 13`.

No runtime example is added because the phase intentionally has no changed
behavior. Regression coverage is the static substrate smoke:
`runtime_substrate_inventory` checks the detail fragments, and
`runtime_substrate_string_map_set` checks that bridge helpers and residual hash
helpers stay distinguishable. Future movement requires an explicit backend
design rather than a helper-by-helper runtime prelude migration.
