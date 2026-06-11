# ADR 0460: Bridge Number Container Equality To Runtime Prelude

## Status

Accepted

## Context

Phase 4.39 kept `topaz_string_eq(...)` as the Map/Set C equality token while
delegating byte equality to `__topaz_string_eq`. Phase 4.40 did the same for
boolean hashing/equality with `__topaz_boolean_hash` and
`__topaz_boolean_key_eq`, but its docs described number hash/equality together
as future backend work. That statement was too broad for equality: the
SameValueZero boolean decision for already-hash-matched number keys is
expressible in the runtime prelude, while the number hash remains bit-level C
substrate.

## Decision

Add hidden runtime prelude helper `__topaz_number_key_eq(a, b)` for number
SameValueZero equality, and keep `topaz_key_eq_number(...)` as the C ABI
equality-function token used by `TOPAZ_MAP_DEFINE(...)` and
`TOPAZ_SET_DEFINE(...)`. The C bridge now delegates to generated symbol
`topaz_fn_runtime_prelude___topaz_number_key_eq(...)`.

This supersedes only the overly broad Phase 4.40 / ADR 0459 statement that
kept "number hash/equality" together outside scope. Number hashing remains C
substrate: `topaz_hash_number(...)` still owns `-0` normalization, canonical
NaN bit representation, `uint64_t` copying, and splitmix-style `size_t`
mixing. The C ABI equality token and `container-monomorph-boundary` lane also
remain.

Rejected alternatives: moving `topaz_hash_number(...)` would require a new
integer/hash representation decision; rewriting `TOPAZ_MAP_DEFINE(...)` or
`TOPAZ_SET_DEFINE(...)` belongs to future compiler-owned container
monomorphization; exposing `__topaz_number_key_eq` to user modules would expand
the public surface; changing Map/Set representation or slot policy is outside
this bridge.

## Implementation

- `runtime/prelude.ts` defines hidden helper `__topaz_number_key_eq(...)`.
- `runtime/runtime.h` declares
  `topaz_fn_runtime_prelude___topaz_number_key_eq(...)` before
  `topaz_key_eq_number(...)`, then delegates the bridge body to it.
- `scripts/check-runtime-substrate.mjs` keeps `topaz_key_eq_number` in
  `container-monomorph-boundary` while describing it as a runtime prelude
  bridge.
- `tests/smoke.sh` checks the generated-C bridge contract, the hidden helper
  definition, substrate details, and public Map/Set SameValueZero behavior.

## Consequences

Number Map/Set equality has the same runtime behavior for `NaN`, `-0`, `+0`,
and finite keys, but the equality decision now has a TypeScript prelude source.
`examples/map_number_same_value_zero.ts` covers the public positive path, and
`examples/runtime_prelude_number_key_eq_hidden_fail.ts` keeps the helper hidden
from user modules. Container lane counts remain unchanged, including
`container-monomorph-boundary: 13`.
