# 0325 - bigint limb runtime operations

- **Status**: Accepted
- **Date**: 2026-06-06
- **Phase**: 2.4c

## Context

[0323](./0323-bigint-staged-design.md) fixed bigint as a distinct
arbitrary-precision primitive, and [0324](./0324-bigint-value-skeleton.md)
introduced only a decimal-byte value skeleton. 2.4c needs the first real
operator and stringification surface, and the representation must leave room for
future division, modulo, bitwise operations, hashing, and containers.

## Decision

Replace the decimal-byte skeleton with immutable arena-allocated
`topaz_bigint *` objects backed by little-endian 32-bit limbs plus a sign.
Decimal literals parse directly into limbs without going through `double` or JS
`Number`. Runtime helpers allocate fresh results for negation, add/sub/mul,
comparison/equality, and decimal stringification; generated code lowers bigint
operators to those helpers.

Rejected alternatives: decimal-string arithmetic was rejected because it keeps
the 2.4b storage shape and creates near-term debt for division/modulo and
hashing; 64-bit limbs were deferred because 32-bit limbs keep multiply/add
carry handling inside portable `uint64_t`; bigint containers and non-decimal
literal parsing remain separate decisions.

## Implementation

- `runtime/runtime.h:83` defines sign + little-endian `uint32_t` limbs, with
  zero canonicalized as `sign == 0`.
- `runtime/runtime.h:170` parses decimal literal text by repeated `* 10 + digit`
  into the limb buffer.
- `runtime/runtime.h:189` through `runtime/runtime.h:281` implement immutable
  negation, add/sub/mul, compare, and equality helpers.
- `runtime/runtime.h:284` formats canonical decimal text by repeated division
  by `1_000_000_000`, returning a `topaz_string`.
- `runtime/runtime.h:1137` adds console bigint helpers; `console.warn` shares
  the existing stderr family.
- `src/codegen.ts:7990`, `src/codegen.ts:8129`, and
  `src/codegen.ts:10788` lower accepted bigint unary/binary/comparison/equality
  operations while keeping mixed number/bigint and deferred operators rejected.
- `src/codegen.ts:8721` and `src/codegen.ts:8877` route template and
  console bigint stringification through `topaz_bigint_to_string`.
- `MEMO.md:246` marks 2.4c complete.

## Consequences

- **Accepted**: decimal bigint literals can be negated, added, subtracted,
  multiplied, compared, equality-tested, logged, and interpolated in template
  literals with arbitrary precision.
- **Rejected**: mixed number/bigint operators, `/`, `%`, bitwise/shifts,
  string concatenation, bigint boolean conditions, non-decimal literals, and
  Array/Map/Set bigint monomorphs remain unsupported.
- **Regression**: `bigint_arithmetic`, `bigint_large_limb`, and
  `bigint_sign_zero` cover positive runtime behavior; targeted fail cases cover
  the deferred boundary. Cumulative smoke entries: 329.
- **Scope out**: `BigInt()`, `.toString()`, non-decimal literal syntax,
  division/modulo, bitwise/shifts, hashing, containers, and faster parse/format
  algorithms remain future work.
