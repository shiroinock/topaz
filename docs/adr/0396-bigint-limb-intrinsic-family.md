# 0396 - bigint limb intrinsic family

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 3.69

## Context

ADR [0323](./0323-bigint-staged-design.md) fixed `bigint` as a distinct
arbitrary-precision primitive, and ADR
[0325](./0325-bigint-limb-runtime-operations.md) fixed the current generated-C
ABI as immutable arena-allocated `topaz_bigint *` values backed by
little-endian 32-bit limbs plus `sign`. Phases 3.61 through 3.68 proved the
hidden pseudo-type pattern with `StringBuffer` and removed the old
`needs-string-buffer-intrinsics` lane. The substrate checker still reports the
17-symbol `needs-bigint-limb-intrinsics` lane for the remaining
`topaz_bigint_*` helper algorithms in `runtime/runtime.h`.

## Decision

Adopt an internal-prelude-only `BigIntBuffer` pseudo type and hidden limb
intrinsic family as the prerequisite for migrating BigInt helpers into
`runtime/prelude.ts`. The target family is
`__topaz_bigint_buffer_new(capacity: number): BigIntBuffer`,
`__topaz_bigint_buffer_to_bigint(buffer: BigIntBuffer, sign: number): bigint`,
`__topaz_bigint_buffer_len(buffer: BigIntBuffer): number`,
`__topaz_bigint_buffer_get_limb(buffer: BigIntBuffer, index: number): number`,
`__topaz_bigint_buffer_set_limb(buffer: BigIntBuffer, index: number, limb: number): void`,
`__topaz_bigint_limb_len(value: bigint): number`,
`__topaz_bigint_limb(value: bigint, index: number): number`, and
`__topaz_bigint_sign(value: bigint): number`. `BigIntBuffer` is opaque
compiler state accepted only while compiling the internal runtime prelude; it
is not a public class, interface, import, structural type, `Array<number>`, or
pointer escape. Rejected alternatives: public `BigIntBuffer` or ordinary
`Array<number>` limb storage was rejected because mutable representation access
is compiler-owned runtime machinery; rewriting bigint as `number`, `int64`, or
decimal strings was rejected because it breaks the arbitrary-precision design;
vendoring GMP or another native library was rejected by the single-binary
runtime direction; migrating all `topaz_bigint_*` helpers in one phase was
rejected because parse, arithmetic, formatting, string allocation, and public
lowering targets are separate risks; retaining the lane permanently was
rejected because the runtime TS migration plan names it as the next algorithmic
migration lane once limb intrinsics exist.

## Implementation

- `docs/runtime-ts-migration.md` records the internal-prelude-only BigInt limb
  intrinsic family, the unchanged generated-C `topaz_bigint *` ABI boundary,
  and the staged order for future implementation slices.
- `MEMO.md` records the Phase 3.69 design checkpoint in the runtime migration
  checklist.
- No runtime, prelude, codegen, embedded generated source, substrate checker,
  smoke, example, or public BigInt behavior changes land in this phase.

## Consequences

- **Accepted**: future implementation phases can first add pseudo type and
  hidden lowering while keeping the current C helpers, then migrate
  `zero`/`neg`/`copy_abs`/comparison/equality helpers, then add/sub/mul, and
  finally decimal parse/format.
- **Rejected**: user modules still cannot name `BigIntBuffer` or
  `__topaz_bigint_*` helpers, and this phase does not add public BigInt API.
- **Regression**: existing build, runtime-substrate, and smoke gates remain the
  validation path; `needs-bigint-limb-intrinsics` should still report the same
  17-symbol lane until implementation phases land.
- **Scope outside**: no ABI representation change, external BigInt library,
  public lowering target migration, or helper removal is included here.
