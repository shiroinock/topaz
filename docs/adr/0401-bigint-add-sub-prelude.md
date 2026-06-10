# 0401 - bigint add/sub prelude migration

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.74

## Context

ADR [0400](./0400-bigint-unary-negation-prelude.md) moved public BigInt unary
negation into the runtime prelude after equality and ordering. Binary
addition/subtraction are the next public result-producing BigInt operators, and
they should move together because the old C `topaz_bigint_sub(...)` delegated
through `topaz_bigint_add(...)`.

## Decision

Route public bigint binary `+` / `-` through runtime prelude
`__topaz_bigint_add(a, b)` and `__topaz_bigint_sub(a, b)`. The helpers preserve
the old semantics: zero operands clone the other operand, same-sign operands
use absolute limb addition with carry, different-sign operands compare absolute
values and subtract the smaller absolute value from the larger one, equal
absolute values return canonical `0n`, and subtraction adds the negated RHS.
Rejected alternatives: keeping only subtraction in C was rejected because it
would preserve a stale public add boundary; migrating multiplication was
rejected because it has a separate nested-limb algorithm; exposing the helpers
to user modules was rejected because they remain compiler-owned runtime
machinery.

## Implementation

- `runtime/prelude.ts:95` adds `__topaz_bigint_add_abs(...)`,
  `__topaz_bigint_sub_abs(...)`, `__topaz_bigint_add(...)`, and
  `__topaz_bigint_sub(...)` using sign, limb inspection, and `BigIntBuffer`
  intrinsics.
- `src/codegen.ts:2125` adds stable runtime prelude emission helpers for
  addition/subtraction, and `src/codegen.ts:8416` routes only bigint binary
  `+` / `-` through them while keeping `*` on `topaz_bigint_mul(...)`.
- `runtime/runtime.h:124` removes `topaz_bigint_copy_abs(...)`, and
  `runtime/runtime.h:274` now leaves `topaz_bigint_mul(...)` as the remaining
  public BigInt arithmetic helper in C.
- `scripts/check-runtime-substrate.mjs:133` removes the five stale inventory
  entries, so `tests/smoke.sh:22` now asserts
  `needs-bigint-limb-intrinsics: 8` while keeping
  `bigint-limb-intrinsic-family: 8`.

## Consequences

- **Accepted**: public bigint `+` / `-` now exercise Topaz-subset runtime
  prelude code for carry/borrow result construction.
- **Rejected**: multiplication, decimal literal parsing, decimal formatting,
  `topaz_bigint_zero(...)`, allocation, and normalization remain in C.
- **Regression**: `examples/bigint_add_sub_prelude.ts` covers positive add,
  positive subtraction, negative + positive, equal absolute values returning
  zero, multi-limb addition, multi-limb subtraction, multiplication staying
  green, and zero-operand cloning. `tests/smoke.sh` checks generated C uses
  `topaz_fn_runtime_prelude___topaz_bigint_add` /
  `topaz_fn_runtime_prelude___topaz_bigint_sub` and no standalone removed C
  helper calls/definitions. Hidden fail samples keep both helpers invisible to
  user source.
- **Next**: later BigInt migrations can target multiplication or the remaining
  decimal parse/format substrate once their algorithm boundaries are fixed.
