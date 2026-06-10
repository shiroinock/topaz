# 0397 - bigint buffer intrinsic substrate

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.70

## Context

ADR [0396](./0396-bigint-limb-intrinsic-family.md) fixed the next BigInt
runtime migration boundary as an internal-prelude-only `BigIntBuffer` pseudo
type plus hidden limb intrinsics. Before this phase the C runtime still exposed
only the old 17-helper `needs-bigint-limb-intrinsics` lane, so runtime prelude
code had no compiler-owned way to inspect immutable `bigint` limbs or build a
fresh `topaz_bigint *` result.

## Decision

Add the BigInt analogue of the StringBuffer substrate: `BigIntBuffer` is
accepted only while compiling `runtime/prelude.ts`, and the eight hidden
`__topaz_bigint_*` calls lower directly to C substrate helpers. Keep existing
public BigInt operators and their `topaz_bigint_*` targets unchanged; add
`__topaz_bigint_clone(value)` only as generated-C compile evidence. Rejected
alternatives: migrating public BigInt operations in the same phase was rejected
because arithmetic, comparison, parse, and format have separate risk profiles;
exposing `BigIntBuffer` to user modules was rejected because limb mutation is
compiler-owned machinery; reclassifying the old 17 helpers was rejected because
this phase adds the prerequisite family rather than moving algorithms.

## Implementation

- `runtime/runtime.h:97` adds the opaque C `topaz_bigint_buffer` shape, and
  `runtime/runtime.h:157` adds allocation, materialization, length, limb read /
  write, immutable bigint limb read, and sign helpers with integer range
  checks.
- `src/codegen.ts:79`, `src/codegen.ts:3862`, `src/codegen.ts:9264`, and
  `src/codegen.ts:10400` add `T_BIGINT_BUFFER`, internal-only annotation
  acceptance, emit dispatch, and focused arity/type checks for the hidden
  intrinsic family.
- `runtime/prelude.ts:19` adds `__topaz_bigint_clone(value)`, which allocates a
  buffer, copies and read-checks each limb, verifies buffer length, and
  materializes through `__topaz_bigint_buffer_to_bigint(...)`.
- `scripts/check-runtime-substrate.mjs:27` and
  `scripts/check-runtime-substrate.mjs:217` classify the new eight helpers as
  `bigint-limb-intrinsic-family`, while leaving `needs-bigint-limb-intrinsics`
  on the existing helper algorithms.

## Consequences

- **Accepted**: future phases can migrate leaf BigInt helpers into
  `runtime/prelude.ts` without reopening the representation or public API.
- **Rejected**: user modules still cannot name `BigIntBuffer` or
  `__topaz_bigint_*` helpers; `examples/runtime_prelude_bigint_buffer_hidden_fail.ts`
  locks that boundary.
- **Regression**: `tests/smoke.sh:22` asserts the old BigInt lane remains 17
  and the new family lane is 8; `tests/smoke.sh:635` checks generated C for the
  stable `__topaz_bigint_clone` prelude symbol and BigIntBuffer intrinsic
  calls, then compiles it with `cc -O2 -Iruntime -Wall -Wextra`.
- **Scope outside**: no public BigInt lowering migration, helper removal,
  decimal parse/format rewrite, or external BigInt dependency lands here.
